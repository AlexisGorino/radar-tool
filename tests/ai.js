// node tests/ai.js — lógica pura de ai.js (prompt + parseo), sin red real.
const assert = require("assert");
const path = require("path");

const AI = require(path.join(__dirname, "..", "js", "ai.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
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

test("parseSuggestions lee roles y atributos de una respuesta válida", () => {
  const data = {
    candidates: [
      { content: { parts: [{ text: JSON.stringify({ roles: ["Dev Backend"], atributos: ["Kafka"] }) }] } },
    ],
  };
  assert.deepStrictEqual(AI.parseSuggestions(data), { roles: ["Dev Backend"], atributos: ["Kafka"] });
});

test("parseSuggestions devuelve listas vacías si el JSON viene roto", () => {
  const data = { candidates: [{ content: { parts: [{ text: "no es json" }] } }] };
  assert.deepStrictEqual(AI.parseSuggestions(data), { roles: [], atributos: [] });
});

test("parseSuggestions devuelve listas vacías si falta la respuesta", () => {
  assert.deepStrictEqual(AI.parseSuggestions({}), { roles: [], atributos: [] });
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
