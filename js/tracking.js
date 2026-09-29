// Registro opcional de uso por nombre, para saber quién usa RADAR y cuánto.
// Fire-and-forget a propósito: si el webhook no responde, no debe frenar ni
// romper nada del resto de la app — ver el catch silencioso en logEvent.
// Nunca manda el texto de la JD ni los campos RADAR, solo identidad + qué
// acción se hizo + cuándo. Ver SECURITY.md.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarTracking = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "radar-user-v1";
  // URL de implementación del Apps Script bound a la Sheet "RADAR — Uso"
  // (cuenta mindata.es). Ver SECURITY.md para el detalle del flujo.
  const ENDPOINT =
    "https://script.google.com/macros/s/AKfycbwJHNyWAt7NYC7fQnE2xRcsvmhqUziL-NT159Qy_5SEszXLZBjVYTfx1m2vmI9iNFK4/exec";

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function setUser(nombre, apellido) {
    const user = { nombre: (nombre || "").trim(), apellido: (apellido || "").trim() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch (err) {
      // storage bloqueado — el check-in de este evento igual se manda,
      // solo no se va a recordar en la próxima carga.
    }
    return user;
  }

  function logEvent(evento, extra) {
    const user = getUser();
    if (!user) return;
    const payload = Object.assign(
      {
        nombre: user.nombre,
        apellido: user.apellido,
        evento: evento,
        timestamp: new Date().toISOString(),
      },
      extra || {}
    );
    // text/plain evita el preflight CORS que Apps Script no siempre maneja
    // bien; el body sigue siendo JSON, doPost lo parsea igual.
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Sin conexión, Sheet caída, cuota agotada — lo que sea, no debe
      // afectar el resto de RADAR. Se pierde ese evento y listo.
    });
  }

  return { getUser, setUser, logEvent };
});
