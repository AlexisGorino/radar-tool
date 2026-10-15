// node tests/ai.js — lógica pura de ai.js (prompt + parseo), sin red real.
const assert = require("assert");
const path = require("path");

const AI = require(path.join(__dirname, "..", "js", "ai.js"));

let passed = 0;
let failed = 0;
const failures = [];
const pending = [];
let asyncTail = Promise.resolve();

function test(name, fn) {
  if (fn.constructor && fn.constructor.name === "AsyncFunction") {
    asyncTail = asyncTail.then(() => fn()).then(() => { passed++; }).catch((err) => {
      failed++;
      failures.push({ name, err });
    });
    pending.push(asyncTail);
    return;
  }
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pending.push(result.then(() => { passed++; }).catch((err) => {
        failed++;
        failures.push({ name, err });
      }));
      return;
    }
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

test("buildPrompt incluye el rol y trunca la JD a 4000 caracteres", () => {
  const jd = "z".repeat(5000);
  const prompt = AI.buildPrompt("Backend Developer", jd);
  assert.ok(prompt.includes("Backend Developer"));
  assert.strictEqual(prompt.match(/JD:\n(z+)/)[1].length, 4000);
});

test("buildPrompt no rompe sin JD", () => {
  const prompt = AI.buildPrompt("QA Engineer", "");
  assert.ok(prompt.includes("QA Engineer"));
  assert.ok(!prompt.includes("JD:"));
});

test("buildPrompt admite perfiles tech y no tech y pide no inventar competencias", () => {
  const prompt = AI.buildPrompt("Analista contable", "Conciliaciones bancarias y cierre mensual.");
  assert.match(prompt, /cualquier familia profesional/i);
  assert.match(prompt, /finanzas/i);
  assert.match(prompt, /No inventes requisitos/i);
  assert.doesNotMatch(prompt, /exclusivamente.*IT/i);
});

test("parseSuggestions lee roles y atributos de una respuesta válida", () => {
  const data = {
    candidates: [
      { content: { parts: [{ text: JSON.stringify({ roles: ["Dev Backend"], atributos: ["Kafka"] }) }] } },
    ],
  };
  assert.deepStrictEqual(AI.parseSuggestions(data), { roles: ["Dev Backend"], atributos: ["Kafka"] });
});

test("parseSuggestions informa si el JSON viene roto", () => {
  const data = { candidates: [{ content: { parts: [{ text: "no es json" }] } }] };
  assert.throws(() => AI.parseSuggestions(data), /no se pudo interpretar/);
});

test("parseSuggestions informa si falta la respuesta", () => {
  assert.throws(() => AI.parseSuggestions({}), /sin contenido utilizable/);
});

test("parseSuggestions descarta entradas que no son string y corta en 6", () => {
  const roles = ["a", "b", "c", "d", "e", "f", "g", 42, null];
  const data = { candidates: [{ content: { parts: [{ text: JSON.stringify({ roles, atributos: [] }) }] } }] };
  assert.strictEqual(AI.parseSuggestions(data).roles.length, 6);
});

test("parseJDAnalysis accepts only evidence-backed role, requirements and location", () => {
  const jd = "Buscamos Técnico instalador de telecomunicaciones con FTTH para Islas Canarias, España. Requisitos excluyentes: FTTH y OTDR.";
  const payload = {
    isJobPosting: true,
    jobEvidence: "Buscamos Técnico instalador de telecomunicaciones",
    role: { term: "Técnico instalador de telecomunicaciones", evidence: "Buscamos Técnico instalador de telecomunicaciones" },
    roleAlternatives: ["Field Technician"],
    requiredSkills: [
      { term: "FTTH", evidence: "con FTTH" },
      { term: "OTDR", evidence: "con FTTH" },
      { term: "Kubernetes", evidence: "con FTTH" },
    ],
    preferredSkills: [],
    industries: [],
    locations: [{ country: "España", locality: "Islas Canarias", evidence: "para Islas Canarias, España" }],
    seniority: { term: "Tier I", evidence: "Buscamos Técnico instalador de telecomunicaciones" },
    modality: { term: "híbrido", evidence: "para Islas Canarias, España" },
  };
  const result = AI.parseJDAnalysis({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }, jd);
  assert.strictEqual(result.isJobPosting, true);
  assert.deepStrictEqual(result.rol, ["Técnico instalador de telecomunicaciones"]);
  assert.deepStrictEqual(result.atributos, ["FTTH"]);
  assert.deepStrictEqual(result.alcance, ["España", "Islas Canarias"]);
  assert.deepStrictEqual(result.seniority, []);
  assert.deepStrictEqual(result.modality, []);
});

test("parseJDAnalysis refuses a model's unsupported title and still permits a strong roleless search", () => {
  const jd = "Requisitos excluyentes: FTTH y OTDR en Islas Canarias, España.";
  const payload = {
    isJobPosting: true,
    jobEvidence: "Requisitos excluyentes: FTTH",
    role: { term: "Director de Operaciones", evidence: "Requisitos excluyentes: FTTH" },
    roleAlternatives: [],
    requiredSkills: [{ term: "FTTH", evidence: "Requisitos excluyentes: FTTH" }],
    preferredSkills: [], industries: [],
    locations: [{ country: "España", locality: "Islas Canarias", evidence: "Islas Canarias, España" }],
    seniority: { term: "", evidence: "" }, modality: { term: "", evidence: "" },
  };
  const result = AI.parseJDAnalysis({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }, jd);
  assert.strictEqual(result.isJobPosting, true);
  assert.deepStrictEqual(result.rol, []);
  assert.ok(result.atributos.includes("FTTH"));
});

test("getKey/setKey redondean sobre un localStorage falso", () => {
  const store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  AI.setKey("test-key");
  assert.strictEqual(AI.getKey(), "test-key");
  AI.setKey("");
  assert.strictEqual(AI.getKey(), "");
  delete global.localStorage;
});

test("Gemini usa x-goog-api-key y valida acceso sin generar contenido", async () => {
  const store = { "radar-gemini-key-v1": "AIza-test-secret" };
  global.localStorage = { getItem: (key) => store[key] || "", setItem: (key, value) => { store[key] = value; }, removeItem: (key) => { delete store[key]; } };
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.ok(!String(url).includes("AIza-test-secret"), "the API key must not be placed in the URL");
    assert.strictEqual(options.headers["x-goog-api-key"], "AIza-test-secret");
    return { ok: true, json: async () => ({ name: "models/gemini-3.8-flash" }) };
  };
  try {
    assert.strictEqual(await AI.testConnection(), true);
    assert.strictEqual(calls, 1);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini convierte el rechazo de clave en una instrucción clara", async () => {
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) });
  try {
    await assert.rejects(AI.testConnection(), /API key o sus permisos/);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini reintenta una sola vez tras un 503 y devuelve el análisis", async () => {
  const jd = "Buscamos QA Analyst con Cypress en Córdoba, Argentina.";
  const analysis = {
    isJobPosting: true,
    jobEvidence: "Buscamos QA Analyst",
    role: { term: "QA Analyst", evidence: "Buscamos QA Analyst" },
    roleAlternatives: [], requiredSkills: [{ term: "Cypress", evidence: "con Cypress" }],
    preferredSkills: [], industries: [],
    locations: [{ country: "Argentina", locality: "Córdoba", evidence: "en Córdoba, Argentina" }],
    seniority: { term: "", evidence: "" }, modality: { term: "", evidence: "" },
  };
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({ error: { message: "Service unavailable" } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }) };
  };
  try {
    const result = await AI.analyzeJD(jd);
    assert.strictEqual(calls, 2, "retry primary once after the first 503");
    assert.strictEqual(result.isJobPosting, true);
    assert.deepStrictEqual(result.rol, ["QA Analyst"]);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini comunica claramente cuando el segundo intento también devuelve 503", async () => {
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: false, status: 503, json: async () => ({ error: { message: "Service unavailable" } }) };
  };
  try {
    await assert.rejects(AI.testConnection(), /temporalmente saturado \(503\).*hizo un reintento/);
    assert.strictEqual(calls, 4, "retry primary once, then try both fallback models");
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini cambia al modelo alternativo si el principal sigue en 503", async () => {
  const jd = "Buscamos analista contable con experiencia en conciliaciones bancarias en Buenos Aires, Argentina.";
  const analysis = {
    isJobPosting: true,
    jobEvidence: "Buscamos analista contable",
    role: { term: "analista contable", evidence: "Buscamos analista contable" },
    roleAlternatives: ["accounting analyst"],
    requiredSkills: [{ term: "conciliaciones bancarias", evidence: "conciliaciones bancarias" }],
    preferredSkills: [], industries: [],
    locations: [{ country: "Argentina", locality: "Buenos Aires", evidence: "Buenos Aires, Argentina" }],
    seniority: { term: "", evidence: "" }, modality: { term: "", evidence: "" },
  };
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("gemini-3.8-flash")) {
      return { ok: false, status: 503, json: async () => ({ error: { message: "Service unavailable" } }) };
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }) };
  };
  try {
    const result = await AI.analyzeJD(jd);
    assert.strictEqual(urls.length, 3, "primary gets one retry before fallback");
    assert.ok(urls[2].includes("gemini-3.6-flash"), `expected first fallback, got ${urls[2]}`);
    assert.strictEqual(result.modelUsed, "gemini-3.6-flash");
    assert.deepStrictEqual(result.rol, ["analista contable"]);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini pasa al siguiente modelo alternativo tras un 429 por modelo", async () => {
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("gemini-3.8-flash") || String(url).includes("gemini-3.6-flash")) {
      return { ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded" } }) };
    }
    return { ok: true, json: async () => ({ name: "models/gemini-3.5-flash-lite" }) };
  };
  try {
    assert.strictEqual(await AI.testConnection(), true);
    assert.strictEqual(urls.length, 3);
    assert.ok(urls[2].includes("gemini-3.5-flash-lite"));
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini indica cuando agotó los modelos de respaldo", async () => {
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: "Service unavailable" } }) });
  try {
    await assert.rejects(AI.testConnection(), /modelos alternativos configurados/);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini envía la JD en JSON y devuelve criterios confirmables", async () => {
  const jd = "Buscamos QA Analyst con Cypress en Córdoba, Argentina. Excel es deseable.";
  const analysis = {
    isJobPosting: true,
    jobEvidence: "Buscamos QA Analyst",
    role: { term: "QA Analyst", evidence: "Buscamos QA Analyst" },
    roleAlternatives: ["Analista QA"],
    requiredSkills: [{ term: "Cypress", evidence: "con Cypress" }],
    preferredSkills: [{ term: "Excel", evidence: "Excel es deseable" }],
    industries: [],
    locations: [{ country: "Argentina", locality: "Córdoba", evidence: "en Córdoba, Argentina" }],
    seniority: { term: "", evidence: "" },
    modality: { term: "", evidence: "" },
  };
  global.localStorage = { getItem: () => "AIza-test-secret" };
  const previousFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.ok(String(url).endsWith("/models/gemini-3.8-flash:generateContent"));
    assert.ok(!String(url).includes("AIza-test-secret"));
    assert.strictEqual(options.headers["x-goog-api-key"], "AIza-test-secret");
    const prompt = options.body && JSON.parse(options.body).contents[0].parts[0].text;
    assert.ok(prompt.includes(jd));
    const responseSchema = JSON.parse(options.body).generationConfig.responseSchema;
    assert.strictEqual(responseSchema.type, "OBJECT");
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }) };
  };
  try {
    const result = await AI.analyzeJD(jd);
    assert.strictEqual(result.isJobPosting, true);
    assert.deepStrictEqual(result.rol, ["QA Analyst"]);
    assert.deepStrictEqual(result.atributos, ["Cypress"]);
    assert.deepStrictEqual(result.alcance, ["Argentina", "Córdoba"]);
  } finally {
    global.fetch = previousFetch;
    delete global.localStorage;
  }
});

test("Gemini informa cuando la API responde sin contenido", async () => {
  assert.throws(() => AI.parseJDAnalysis({ candidates: [] }, "Buscamos QA en Madrid"), /sin contenido utilizable/);
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
  if (failed) {
    failures.forEach((f) => {
      console.log(`FAIL: ${f.name}`);
      console.log(`  ${f.err.message}\n`);
    });
    process.exit(1);
  } else {
    console.log("All tests passed.");
    process.exit(0);
  }
});
