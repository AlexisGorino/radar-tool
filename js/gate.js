// Runs synchronously in <head>, before the rest of the page parses, so an
// already-unlocked visitor never sees a flash of the login screen (the same
// trick sites use to avoid a flash of the wrong color theme). Deliberately
// tiny and dependency-free: its only job is to stamp a class on <html>
// before paint. The actual password check lives in app.js, alongside every
// other DOM-facing interaction in this codebase.
(function () {
  "use strict";
  try {
    if (localStorage.getItem("radar-auth-v1") === "ok") {
      document.documentElement.classList.add("authed");
    }
  } catch (e) {
    // private browsing / storage disabled — falls back to showing the gate
  }
})();
