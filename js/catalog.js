/* ==========================================================================
   CosmoEmpire — логика страницы «Каталог»
   Фильтры (игра / тип / цена), поиск по названию, сортировка.
   ========================================================================== */

(function () {
  "use strict";

  var CE = window.CE;
  var allItems = [];
  var timer = null;

  var el = {
    search:    document.getElementById("f-search"),
    clear:     document.getElementById("f-clear"),
    game:      document.getElementById("f-game"),
    type:      document.getElementById("f-type"),
    priceMin:  document.getElementById("f-price-min"),
    priceMax:  document.getElementById("f-price-max"),
    sort:      document.getElementById("f-sort"),
    reset:     document.getElementById("f-reset"),
    chips:     document.getElementById("f-chips"),
    grid:      document.getElementById("catalog-grid"),
    count:     document.getElementById("catalog-count"),
    total:     document.getElementById("catalog-total"),
    note:      document.getElementById("catalog-note")
  };

  /* --------------------------- Состояние ------------------------------- */

  function readFilters() {
    return {
      search: el.search ? el.search.value : "",
      game: el.game ? el.game.value : "all",
      type: el.type ? el.type.value : "all",
      priceMin: el.priceMin ? el.priceMin.value : "",
      priceMax: el.priceMax ? el.priceMax.value : "",
      sort: el.sort ? el.sort.value : "popular"
    };
  }

  function resetFilters() {
    if (el.search) el.search.value = "";
    if (el.game) el.game.value = "all";
    if (el.type) el.type.value = "all";
    if (el.priceMin) el.priceMin.value = "";
    if (el.priceMax) el.priceMax.value = "";
    if (el.sort) el.sort.value = "popular";
    toggleClearButton();
    render();
  }

  function toggleClearButton() {
    if (!el.clear || !el.search) return;
    el.clear.classList.toggle("is-visible", el.search.value.length > 0);
  }

  /* --------------------------- Отрисовка ------------------------------ */

  function emptyStateHtml() {
    var f = readFilters();
    var isFiltered = !!(f.search || f.game !== "all" || f.type !== "all" || f.priceMin !== "" || f.priceMax !== "");
    if (isFiltered) {
      return '<div class="empty">' +
        '<div class="empty__icon">&#128269;</div>' +
        '<h3 class="empty__title">Ничего не найдено</h3>' +
        '<p class="empty__text">По выбранным условиям товаров нет. Попробуйте изменить запрос, сбросить фильтры или заглянуть позже — ассортимент пополняется.</p>' +
        '<button class="btn btn--primary" data-reset>Сбросить фильтры</button>' +
        '</div>';
    }
    return '<div class="empty">' +
      '<div class="empty__icon">&#128230;</div>' +
      '<h3 class="empty__title">Каталог пока пуст</h3>' +
      '<p class="empty__text">Товары будут добавлены позже. Ассортимент пополняется — загляните чуть позже или предложите товар для размещения.</p>' +
      '<a class="btn btn--primary" href="add-item.html">Добавить товар</a>' +
      '</div>';
  }

  function renderChips(f) {
    if (!el.chips) return;
    var chips = [];
    if (f.search) chips.push({ key: "search", label: "Поиск: " + f.search });
    if (f.game !== "all") chips.push({ key: "game", label: "Игра: " + f.game });
    if (f.type !== "all") chips.push({ key: "type", label: "Тип: " + f.type });
    if (f.priceMin !== "") chips.push({ key: "priceMin", label: "от " + CE.formatPrice(f.priceMin) });
    if (f.priceMax !== "") chips.push({ key: "priceMax", label: "до " + CE.formatPrice(f.priceMax) });

    el.chips.innerHTML = chips.map(function (c) {
      return '<span class="chip">' + CE.esc(c.label) + '<button data-chip="' + c.key + '" aria-label="Убрать фильтр">&times;</button></span>';
    }).join("");
  }


  function render() {
    var f = readFilters();
    var items = CE.apply(allItems, f);

    CE.setCurrentItems(items);

    el.grid.innerHTML = items.length
      ? items.map(CE.cardHtml).join("")
      : emptyStateHtml();

    if (el.count) {
      el.count.innerHTML = allItems.length
        ? "Показано <b>" + items.length + "</b> из " + allItems.length
        : "Товаров пока нет";
    }
    if (el.total) el.total.textContent = allItems.length;
    renderChips(f);
  }

  /* --------------------------- Инициализация --------------------------- */

  function fillFilterOptions() {
    var cfg = CE.CFG || {};
    CE.fillSelect(el.game, CE.uniq(allItems, "game", cfg.GAMES || []), "Все игры");
    CE.fillSelect(el.type, CE.uniq(allItems, "type", cfg.TYPES || []), "Все типы");
  }

  function showSkeleton() {
    var html = "";
    for (var i = 0; i < 6; i++) html += CE.skeletonHtml();
    el.grid.innerHTML = html;
  }

  /** Откладывает вызов функции — чтобы не дёргать рендер на каждую букву. */
  function debounced(fn, ms) {
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function init() {
    CE.initModal();
    showSkeleton();

    CE.load().then(function (items) {
      allItems = items;
      fillFilterOptions();
      render();
      if (el.note) el.note.style.display = "none";
    });

    if (el.search) {
      el.search.addEventListener("input", debounced(function () {
        toggleClearButton();
        render();
      }, 180));
    }
    if (el.clear) {
      el.clear.addEventListener("click", function () {
        el.search.value = "";
        toggleClearButton();
        render();
      });
    }

    [el.game, el.type, el.sort].forEach(function (node) {
      if (node) node.addEventListener("change", render);
    });

    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    [el.priceMin, el.priceMax].forEach(function (node) {
      if (node) node.addEventListener("input", debounced(render, 250));
    });
    if (el.reset) el.reset.addEventListener("click", resetFilters);

    /* Кнопка «Сбросить» внутри пустого состояния и крестики чипов */
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      if (t.closest("[data-reset]")) { resetFilters(); return; }

      var chip = t.closest("[data-chip]");
      if (!chip) return;
      var key = chip.getAttribute("data-chip");
      if (key === "search" && el.search) el.search.value = "";
      else if (key === "priceMin" && el.priceMin) el.priceMin.value = "";
      else if (key === "priceMax" && el.priceMax) el.priceMax.value = "";
      else if (el[key]) el[key].value = "all";
      toggleClearButton();
      render();
    });

    /* "?search=valorant" в адресе — переход с главной страницы */
    var params = new URLSearchParams(window.location.search);
    if (params.get("search") && el.search) {
      el.search.value = params.get("search");
      toggleClearButton();
      setTimeout(render, 0);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
