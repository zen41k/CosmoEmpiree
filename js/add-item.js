/* ==========================================================================
   CosmoEmpire — форма «Добавить товар»
   Валидация, нормализация данных и отправка в Google Sheets
   через веб-приложение Apps Script.
   ========================================================================== */

(function () {
  "use strict";

  var CE = window.CE;
  var API_URL = (CE.API_URL || "").trim();

  var form   = document.getElementById("add-form");
  var status = document.getElementById("form-status");
  var btn    = document.getElementById("submit-btn");

  /* ------------------------------------------------------------------ */
  /*  Уведомления                                                         */
  /* ------------------------------------------------------------------ */

  function showStatus(kind, html) {
    if (!status) return;
    var icon = kind === "ok" ? "&#10004;" : (kind === "err" ? "&#10005;" : "&#9888;");
    status.innerHTML = '<div class="notice notice--' + (kind === "note" ? "" : kind) + '">' +
      '<span>' + icon + '</span><div>' + html + '</div></div>';
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearStatus() { if (status) status.innerHTML = ""; }

  /* ------------------------------------------------------------------ */
  /*  Заполнение выпадающих списков игр и типов                            */
  /* ------------------------------------------------------------------ */

  function fillSelects() {
    var cfg = CE.CFG || {};
    var game = document.getElementById("in-game");
    var type = document.getElementById("in-type");

    var games = cfg.GAMES && cfg.GAMES.length ? cfg.GAMES : ["Другая игра"];
    var types = cfg.TYPES && cfg.TYPES.length ? cfg.TYPES : ["Другое"];

    if (game) {
      game.innerHTML = '<option value="">Выберите игру</option>' +
        games.map(function (g) { return '<option value="' + CE.esc(g) + '">' + CE.esc(g) + '</option>'; }).join("") +
        '<option value="__other">Другая игра…</option>';
    }
    if (type) {
      type.innerHTML = '<option value="">Не указан</option>' +
        types.map(function (t) { return '<option value="' + CE.esc(t) + '">' + CE.esc(t) + '</option>'; }).join("");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Ссылка на изображение: https-ссылка, ID файла Диска или пусто         */
  /* ------------------------------------------------------------------ */

  function normalizeImage(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";

    /* Голый ID файла Google Диска */
    if (/^[a-zA-Z0-9_-]{25,}$/.test(value) && !/[:/]/.test(value)) {
      return "https://drive.google.com/uc?export=view&id=" + value;
    }
    /* Ссылка на файл Диска -> прямая ссылка на просмотр */
    var drive = value.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (drive) return "https://drive.google.com/uc?export=view&id=" + drive[1];

    return value;
  }

  /* ------------------------------------------------------------------ */
  /*  Чтение и проверка формы                                             */
  /* ------------------------------------------------------------------ */

  function value(id) {
    var node = document.getElementById(id);
    return node ? String(node.value || "").trim() : "";
  }

  function readForm() {
    return {
      name:        value("in-name"),
      game:        value("in-game"),
      type:        value("in-type"),
      description: value("in-description"),
      price:       value("in-price"),
      image:       normalizeImage(value("in-image")),
      tags:        value("in-tags")
    };
  }

  function validate(data) {
    if (!data.name) return "Укажите название товара.";
    if (data.name.length < 3) return "Название слишком короткое — минимум 3 символа.";
    if (!data.game || data.game === "__other") return "Выберите игру.";
    if (!data.description) return "Добавьте описание товара.";
    if (data.description.length < 10) return "Описание слишком короткое — минимум 10 символов.";
    if (!data.price) return "Укажите цену.";
    if (CE.parsePrice(data.price) <= 0) return "Цена должна быть больше нуля.";
    if (data.image && !/^https?:\/\//i.test(data.image)) {
      return "Ссылка на изображение должна начинаться с http:// или https://.";
    }
    return null;
  }


  /* ------------------------------------------------------------------ */
  /*  Отправка                                                            */
  /* ------------------------------------------------------------------ */

  function setBusy(busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Отправляем…" : "Отправить товар";
  }

  /** Тело в формате x-www-form-urlencoded: такой POST не вызывает preflight. */
  function submit(data) {
    var body = Object.keys(data).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]);
    }).join("&");

    return fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    clearStatus();

    var data = readForm();
    var error = validate(data);
    if (error) {
      showStatus("err", CE.esc(error));
      return;
    }

    if (!API_URL) {
      showStatus("note",
        "Форма работает в <b>демо-режиме</b>: данные не отправлены в таблицу. " +
        "Чтобы товары попадали в каталог, укажите адрес веб-приложения в файле <code>js/config.js</code>.");
      console.log("CosmoEmpire — отправка формы:", data);
      form.reset();
      return;
    }

    setBusy(true);
    submit(data)
      .then(function () {
        setBusy(false);
        showStatus("ok",
          "Спасибо! Товар <b>" + CE.esc(data.name) + "</b> отправлен и появится в каталоге после проверки.");
        form.reset();
      })
      .catch(function () {
        setBusy(false);
        showStatus("err", "Не удалось отправить форму. Проверьте подключение и попробуйте ещё раз.");
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Инициализация                                                       */
  /* ------------------------------------------------------------------ */

  function init() {
    fillSelects();

    if (form) form.addEventListener("submit", onSubmit);

    var reset = document.getElementById("reset-btn");
    if (reset) reset.addEventListener("click", function () { setTimeout(clearStatus, 0); });

    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    if (!API_URL) {
      showStatus("note",
        "Сейчас включён <b>демо-режим</b>. Форма проверяется, но товары не попадут в таблицу, пока вы не " +
        "укажете адрес веб-приложения в файле <code>js/config.js</code>.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
