/* ============================================================
   Loo-K theme controller
   - Reads localStorage("lookTheme"): "light" (Loo-K green, default)
     or "dark" (legacy). Applies to <html data-theme>.
   - Must be loaded in <head> (not defer) to avoid a flash.
   ============================================================ */
(function () {
  var KEY = "lookTheme";
  var root = document.documentElement;

  function apply(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme"); // default = green
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
      theme = theme === "dark" ? "dark" : "light";
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
