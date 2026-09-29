// Runs synchronously in <head>, before the rest of the page parses, so an
// already-unlocked visitor never sees a flash of the login screen (the same
// trick sites use to avoid a flash of the wrong color theme). Deliberately
// tiny and dependency-free: its only job is to stamp a class on <html>
// before paint. The actual password check lives in app.js, alongside every
// other DOM-facing interaction in this codebase.
(function () {
  "use strict";
  try {
    // Requiere las dos cosas: quien ya entró antes de que existiera el
    // campo de nombre (radar-user-v1) tiene que volver a pasar por el
    // gate una vez más para completarlo — si no, nunca queda registrado.
    if (localStorage.getItem("radar-auth-v1") === "ok" && localStorage.getItem("radar-user-v1")) {
      document.documentElement.classList.add("authed");
    }
  } catch (e) {
    // private browsing / storage disabled — falls back to showing the gate
  }
})();
