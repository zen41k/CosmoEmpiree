/* ==========================================================================
   CosmoEmpire — ядро: загрузка данных, фильтры, сортировка, карточки.
   Глобальный объект window.CE, используется всеми страницами сайта.
   ========================================================================== */

window.CE = (function () {
  "use strict";

  var CFG = window.CE_CONFIG || {};
  var API_URL = (CFG.API_URL || "").trim();
  var DEMO_ITEMS = Array.isArray(window.CE_DEMO) ? window.CE_DEMO : [];
  var currentItems = [];

  /* ------------------------------------------------------------------ */
  /*  Вспомогательные функции                                            */
  /* ------------------------------------------------------------------ */

  /** Экранирование текста перед вставкой в innerHTML (защита от XSS). */
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Разбор цены: принимает "1500", "1 500", "1 500 ₽", "990.50". */
  function parsePrice(value) {
    if (typeof value === "number") return isFinite(value) ? value : 0;
    var n = parseFloat(String(value == null ? "" : value)
      .replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  /** 1500 -> "1 500 ₽" */
  function formatPrice(value) {
    return parsePrice(value).toLocaleString("ru-RU") + " ₽";
  }

  /** Теги: принимает строку "чит, aim, esp" или массив. Всегда массив. */
  function parseTags(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(function (t) { return String(t).trim(); });
    if (value == null || value === "") return [];
    return String(value).split(/[,;|]/).map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /** Дата: ISO-строка, число (мс) или Date -> Date или null. */
  function parseDate(value) {
    if (!value && value !== 0) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") return new Date(value);
    var s = String(value).trim();
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    var d = parseDate(value);
    if (!d) return "";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /** Краткое описание — первое предложение, максимум 140 символов. */
  function shortDescription(text) {
    var s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= 140) return s;
    var cut = s.slice(0, 140);
    var dot = cut.lastIndexOf(".");
    if (dot > 60) cut = cut.slice(0, dot + 1);
    return cut + "…";
  }

  /** Приводит строку товара из таблицы к единому виду. */
  function normalizeItem(raw) {
    if (!raw) return null;
    var name = String(raw.name != null ? raw.name : (raw.title != null ? raw.title : raw["Название"])).trim();
    if (!name) return null;
    var description = String(raw.description != null ? raw.description : (raw["Описание"] || "")).trim();
    return {
      id: String(raw.id != null ? raw.id : name).trim(),
      name: name,
      game: String(raw.game != null ? raw.game : (raw["Игра"] || "")).trim() || "Не указана",
      type: String(raw.type != null ? raw.type : (raw["Тип"] || "")).trim(),
      description: description,
      shortDescription: shortDescription(description),
      price: parsePrice(raw.price != null ? raw.price : raw["Цена"]),
      tags: parseTags(raw.tags != null ? raw.tags : raw["Теги"]),
      image: String(raw.image != null ? raw.image : (raw["Изображение"] || "")).trim(),
      addedAt: parseDate(raw.addedAt != null ? raw.addedAt : raw["Дата добавления"]),
      views: Number(raw.views != null ? raw.views : (raw["Просмотры"] || 0)) || 0
    };
  }


  /* ------------------------------------------------------------------ */
  /*  Загрузка данных                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Загружает товары.
   * 1) если API_URL не задан  -> демо-режим (встроенные данные DEMO_ITEMS);
   * 2) если API_URL задан     -> запрос к Google Apps Script;
   * 3) если таблица пустая    -> демо-карточки (если USE_DEMO_WHEN_EMPTY).
   *
   * Демо-данные встроены прямо в код, а не читаются файлом, поэтому каталог
   * работает даже при открытии index.html двойным щелчком (протокол file://),
   * где браузер запрещает fetch к локальным файлам.
   */
  function load() {
    var fallback = function () {
      return Promise.resolve(DEMO_ITEMS.map(normalizeItem).filter(Boolean));
    };

    if (!API_URL) return fallback();

    return fetch(API_URL + "?action=items&_=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        var items = (json.items || json.data || []).map(normalizeItem).filter(Boolean);
        if (!items.length && CFG.USE_DEMO_WHEN_EMPTY !== false) return fallback();
        return items;
      })
      .catch(function () { return []; });
  }

  /* ------------------------------------------------------------------ */
  /*  Фильтрация, поиск и сортировка                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Фильтрует и сортирует список товаров.
   * f = { search, game, type, priceMin, priceMax, sort }
   * sort: popular | new | old | price_asc | price_desc
   */
  function apply(items, f) {
    f = f || {};
    var q = String(f.search || "").trim().toLowerCase();
    var min = (f.priceMin === "" || f.priceMin == null) ? null : parsePrice(f.priceMin);
    var max = (f.priceMax === "" || f.priceMax == null) ? null : parsePrice(f.priceMax);

    var out = items.filter(function (it) {
      if (q) {
        var hay = [it.name, it.game, it.type, it.description, it.tags.join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (f.game && f.game !== "all" && it.game !== f.game) return false;
      if (f.type && f.type !== "all" && it.type !== f.type) return false;
      if (min != null && it.price < min) return false;
      if (max != null && it.price > max) return false;
      return true;
    });

    var byTime = function (a, b) {
      var ta = a.addedAt ? a.addedAt.getTime() : 0;
      var tb = b.addedAt ? b.addedAt.getTime() : 0;
      return tb - ta;
    };

    out.sort(function (a, b) {
      switch (f.sort) {
        case "price_asc":  return a.price - b.price;
        case "price_desc": return b.price - a.price;
        case "new":        return byTime(a, b);
        case "old":        return -byTime(a, b);
        case "popular":
        default:           return (b.views - a.views) || byTime(a, b);
      }
    });

    return out;
  }

  /** Список уникальных значений поля, отсортированный по алфавиту. */
  function uniq(items, key, fallbackList) {
    var set = {};
    items.forEach(function (it) { if (it[key]) set[it[key]] = 1; });
    var arr = Object.keys(set);
    if (!arr.length && fallbackList && fallbackList.length) arr = fallbackList.slice();
    return arr.sort(function (a, b) { return a.localeCompare(b, "ru"); });
  }

  /* ------------------------------------------------------------------ */
  /*  ШАБЛОН КАРТОЧКИ ТОВАРА                                             */
  /*  название · игра · краткое описание · цена · кнопка «Подробнее» · теги */
  /* ------------------------------------------------------------------ */

  function cardHtml(item) {
    var previewLimit = CFG.TAGS_PREVIEW || 3;
    var shown = item.tags.slice(0, previewLimit);
    var rest = item.tags.length - shown.length;

    var media = item.image
      ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy" decoding="async">'
      : '<span class="card__placeholder">&#127918;</span>';

    var meta = [];
    if (item.addedAt) meta.push(esc(formatDate(item.addedAt)));
    if (item.views) meta.push(esc(item.views) + " просм.");

    return '' +
      '<article class="card" data-id="' + esc(item.id) + '">' +
        '<div class="card__media">' + media +
          '<div class="card__badges">' +
            '<span class="badge badge--game">' + esc(item.game) + '</span>' +
            (item.type ? '<span class="badge badge--type">' + esc(item.type) + '</span>' : "") +
          '</div>' +
        '</div>' +
        '<div class="card__body">' +
          '<h3 class="card__title">' + esc(item.name) + '</h3>' +
          '<p class="card__desc">' + esc(item.shortDescription) + '</p>' +
          '<ul class="card__tags">' +
            shown.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") +
            (rest > 0 ? '<li class="more">+' + rest + '</li>' : "") +
          '</ul>' +
          '<div class="card__foot">' +
            '<span class="card__price">' + esc(formatPrice(item.price)) + '</span>' +
            '<button class="btn btn--primary btn--sm" data-more="' + esc(item.id) + '">Подробнее</button>' +
          '</div>' +
          (meta.length ? '<div class="card__meta">' + meta.join(" &middot; ") + '</div>' : "") +
        '</div>' +
      '</article>';
  }

  /* Шаблон карточки-скелетона (пока грузятся данные). */
  function skeletonHtml() {
    return '<div class="skeleton">' +
      '<div class="skeleton__media"></div>' +
      '<div class="skeleton__body">' +
        '<div class="skeleton__line skeleton__line--mid"></div>' +
        '<div class="skeleton__line skeleton__line--short"></div>' +
        '<div class="skeleton__line"></div>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------------ */
  /*  Модальное окно «Подробнее»                                          */
  /* ------------------------------------------------------------------ */

  var lastFocused = null;

  function detailHtml(item) {
    var media = item.image
      ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '">'
      : '<span class="card__placeholder">&#127918;</span>';

    var rows = [
      ["Игра", item.game],
      ["Тип", item.type],
      ["Цена", formatPrice(item.price)],
      ["Добавлено", item.addedAt ? formatDate(item.addedAt) : ""],
      ["Просмотры", item.views ? String(item.views) : ""]
    ].filter(function (r) { return r[1] !== ""; });

    return '' +
      '<button class="modal__close" data-close aria-label="Закрыть">&times;</button>' +
      '<div class="modal__media">' + media + '</div>' +
      '<div class="modal__body">' +
        '<h2 class="modal__title">' + esc(item.name) + '</h2>' +
        '<div class="modal__badges">' +
          '<span class="badge badge--game">' + esc(item.game) + '</span>' +
          (item.type ? '<span class="badge badge--type">' + esc(item.type) + '</span>' : "") +
        '</div>' +
        '<ul class="specs">' +
          rows.map(function (r) {
            return '<li><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></li>';
          }).join("") +
        '</ul>' +
        (item.description ? '<div class="prose"><p>' + esc(item.description).replace(/\n/g, "<br>") + '</p></div>' : "") +
        (item.tags.length
          ? '<ul class="modal__tags">' + item.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>'
          : "") +
        '<div class="modal__actions">' +
          '<button class="btn btn--primary" data-close>Закрыть</button>' +
        '</div>' +
      '</div>';
  }

  function openModal(item) {
    var modal = document.getElementById("ce-modal");
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.innerHTML = '<div class="modal__backdrop" data-close></div>' +
                      '<div class="modal__box" role="dialog" aria-modal="true" aria-label="' + esc(item.name) + '">' +
                      detailHtml(item) + '</div>';
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    var first = modal.querySelector(".modal__close");
    if (first) first.focus();
  }

  function closeModal() {
    var modal = document.getElementById("ce-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /** Один делегированный обработчик на весь сайт: «Подробнее», закрытие, Esc. */
  function initModal() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-close]")) { closeModal(); return; }
      var btn = t.closest("[data-more]");
      if (!btn) return;
      var id = btn.getAttribute("data-more");
      var item = currentItems.filter(function (x) { return x.id === id; })[0];
      if (item) { bumpViews(item); openModal(item); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Счётчик просмотров — основа сортировки «по популярности»             */
  /* ------------------------------------------------------------------ */

  function bumpViews(item) {
    if (!API_URL || !item) return;
    try {
      fetch(API_URL + "?action=view&id=" + encodeURIComponent(item.id), { mode: "no-cors" }).catch(function () {});
    } catch (err) { /* счётчик не критичен для работы каталога */ }
  }

  function setCurrentItems(list) { currentItems = list || []; }

  /* ------------------------------------------------------------------ */
  /*  Заполнение выпадающих списков                                        */
  /* ------------------------------------------------------------------ */

  function fillSelect(select, values, allLabel) {
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="all">' + esc(allLabel) + '</option>' +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join("");
    if (values.indexOf(current) !== -1) select.value = current;
    else select.value = "all";
  }

  /* ------------------------------------------------------------------ */
  /*  Публичный интерфейс модуля                                          */
  /* ------------------------------------------------------------------ */

  return {
    CFG: CFG,
    API_URL: API_URL,
    esc: esc,
    parsePrice: parsePrice,
    formatPrice: formatPrice,
    parseTags: parseTags,
    parseDate: parseDate,
    formatDate: formatDate,
    normalizeItem: normalizeItem,
    load: load,
    apply: apply,
    uniq: uniq,
    cardHtml: cardHtml,
    skeletonHtml: skeletonHtml,
    openModal: openModal,
    closeModal: closeModal,
    initModal: initModal,
    setCurrentItems: setCurrentItems,
    bumpViews: bumpViews,
    fillSelect: fillSelect
  };
})();
