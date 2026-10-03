/* ==========================================================================
   CosmoEmpire — аккордеон FAQ на странице «О сайте»
   ========================================================================== */

(function () {
  "use strict";

  function close(item) {
    var panel = item.querySelector(".faq__a");
    if (!panel) return;
    item.classList.remove("is-open");
    panel.style.maxHeight = null;
  }

  function open(item) {
    var panel = item.querySelector(".faq__a");
    if (!panel) return;
    item.classList.add("is-open");
    /* max-height вместо auto, чтобы работала плавная анимация */
    panel.style.maxHeight = panel.scrollHeight + "px";
  }

  function init() {
    var faq = document.getElementById("faq");
    if (!faq) return;

    var items = faq.querySelectorAll(".faq__item");

    /* Первый вопрос открыт по умолчанию, чтобы блок не выглядел пустым */
    if (items.length) open(items[0]);

    faq.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".faq__q") : null;
      if (!btn) return;
      var item = btn.closest(".faq__item");
      if (!item) return;

      var isOpen = item.classList.contains("is-open");
      /* Аккордеон: закрываем остальные, чтобы блок не распухал */
      items.forEach(function (other) { if (other !== item) close(other); });

      if (isOpen) close(item); else open(item);
    });

    /* Пересчёт высоты при изменении размера окна */
    window.addEventListener("resize", function () {
      var openItem = faq.querySelector(".faq__item.is-open");
      if (!openItem) return;
      var panel = openItem.querySelector(".faq__a");
      if (panel) panel.style.maxHeight = panel.scrollHeight + "px";
    });

    /* Переход по якорю #faq открывает первый вопрос */
    if (window.location.hash === "#faq") {
      setTimeout(function () {
        var first = faq.querySelector(".faq__item");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
