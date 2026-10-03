/* ==========================================================================
   CosmoEmpire — главная страница: счётчики и год в подвале
   ========================================================================== */

(function () {
  "use strict";

  var CE = window.CE;

  function set(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function renderStats(items) {
    var cfg = CE.CFG || {};
    if (cfg.SHOW_STATS === false) {
      var box = document.getElementById("hero-stats");
      if (box) box.style.display = "none";
      return;
    }

    var games = CE.uniq(items, "game", []);
    var types = CE.uniq(items, "type", []);
    var latest = items.reduce(function (max, it) {
      return (it.addedAt && it.addedAt.getTime() > max) ? it.addedAt.getTime() : max;
    }, 0);

    set("stat-total", items.length);
    set("stat-games", games.length);
    set("stat-types", types.length || "—");

    var node = document.getElementById("stat-updated");
    if (node) {
      if (!latest) {
        node.textContent = "—";
        node.style.fontSize = "22px";
      } else {
        node.textContent = CE.formatDate(new Date(latest));
      }
    }
  }

  function init() {
    CE.initModal();

    var year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    CE.load().then(renderStats);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
