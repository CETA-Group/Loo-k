/* ============================================================
   Loo-K theme controller
   - Reads localStorage("lookTheme"): "light" (Loo-K green, default)
     or "dark" (legacy). Applies to <html data-theme>.
   - Must be loaded in <head> (not defer) to avoid a flash.
   ============================================================ */
(function () {
  var KEY = "lookTheme";
  var THEMES = ["light", "dark", "pride"]; // "light" = default Loo-K green
  var root = document.documentElement;

  function normalize(theme) {
    return THEMES.indexOf(theme) >= 0 ? theme : "light";
  }

  function apply(theme) {
    theme = normalize(theme);
    if (theme === "light") {
      root.removeAttribute("data-theme"); // default = green
    } else {
      root.setAttribute("data-theme", theme);
    }
  }

  // initial (synchronous, pre-paint)
  var saved = "light";
  try { saved = localStorage.getItem(KEY) || "light"; } catch (e) {}
  apply(saved);

  // public API
  window.LookTheme = {
    get: function () {
      try { return localStorage.getItem(KEY) || "light"; } catch (e) { return "light"; }
    },
    set: function (theme) {
      theme = normalize(theme);
      try { localStorage.setItem(KEY, theme); } catch (e) {}
      apply(theme);
      window.dispatchEvent(new CustomEvent("lookthemechange", { detail: theme }));
    },
    toggle: function () {
      this.set(this.get() === "dark" ? "light" : "dark");
    }
  };

  // enable transitions only after first paint
  window.addEventListener("DOMContentLoaded", function () {
    requestAnimationFrame(function () { root.classList.add("theme-ready"); });
  });

  // keep tabs in sync
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(e.newValue || "light");
  });
})();
