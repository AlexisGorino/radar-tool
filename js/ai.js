// Capa opcional de IA (Gemini) para sugerir sinónimos de rol y atributos de
// nicho que el diccionario estático no cubre. Pura: arma el prompt y parsea
// la respuesta, sin tocar el DOM. La única llamada de red ocurre cuando
// app.js la invoca explícitamente, y sólo si hay una key propia guardada
// (ver setKey/getKey) — ver SECURITY.md para el detalle del modelo.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarAI = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "radar-gemini-key-v1";
  const MODEL = "gemini-2.5-flash";
  const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
  const MAX_JD_CHARS = 4000;
  const MAX_TERMS = 6;

  function getKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function setKey(key) {
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // Storage bloqueado (privada / cuota) — la key solo dura esta carga.
    }
  }

  function buildPrompt(role, jdText) {
    const context = (jdText || "").slice(0, MAX_JD_CHARS);
    return [
      "Sos un asistente de sourcing técnico para reclutadores IT.",
      "Dado un título de puesto y, si está disponible, el texto de su job description, devolvé dos listas de términos para ampliar una búsqueda booleana de candidatos:",
      '"roles": títulos alternativos que un candidato real usaría en su propio perfil para el mismo puesto — no el título tal cual, no genéricos.',
      '"atributos": herramientas, tecnologías o certificaciones de nicho que la JD menciona o implica y que no sean obvias.',
      "Máximo " + MAX_TERMS + " términos por lista, cada uno de 1 a 4 palabras, sin explicaciones ni texto fuera del JSON.",
      "Título: " + role,
      context ? "JD:\n" + context : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => t.trim())
      .slice(0, MAX_TERMS);
  }

  function parseSuggestions(data) {
    const empty = { roles: [], atributos: [] };
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) return empty;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return empty;
    }
    if (!parsed || typeof parsed !== "object") return empty;
    return { roles: cleanList(parsed.roles), atributos: cleanList(parsed.atributos) };
  }

  function errorForStatus(status) {
    if (status === 400 || status === 403) return new Error("Key de Gemini inválida o sin permiso.");
    if (status === 429) return new Error("Límite de uso de Gemini alcanzado, probá de nuevo en un rato.");
    return new Error("Gemini no respondió (" + status + ").");
  }

  async function suggestTerms(role, jdText) {
    const apiKey = getKey();
    if (!apiKey) throw new Error("Sin key de Gemini configurada.");
    if (!role || !role.trim()) throw new Error("Falta un Rol para sugerir términos.");

    const body = {
      contents: [{ parts: [{ text: buildPrompt(role, jdText) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            roles: { type: "ARRAY", items: { type: "STRING" } },
            atributos: { type: "ARRAY", items: { type: "STRING" } },
          },
        },
      },
    };

    const res = await fetch(ENDPOINT + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw errorForStatus(res.status);
    return parseSuggestions(await res.json());
  }

  return { getKey, setKey, buildPrompt, parseSuggestions, suggestTerms };
});
