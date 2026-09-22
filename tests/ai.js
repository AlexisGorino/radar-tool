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
