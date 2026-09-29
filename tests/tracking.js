// node tests/tracking.js — lógica pura de tracking.js, sin red real.
const assert = require("assert");
const path = require("path");

const Tracking = require(path.join(__dirname, "..", "js", "tracking.js"));

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

function fakeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
}

test("setUser recorta espacios y getUser lo devuelve", () => {
  global.localStorage = fakeStorage();
  Tracking.setUser("  Ale  ", "  Gorino  ");
  assert.deepStrictEqual(Tracking.getUser(), { nombre: "Ale", apellido: "Gorino" });
  delete global.localStorage;
});

test("getUser sin check-in previo devuelve null", () => {
  global.localStorage = fakeStorage();
  assert.strictEqual(Tracking.getUser(), null);
  delete global.localStorage;
});

test("getUser tolera localStorage roto o ausente", () => {
  delete global.localStorage;
  assert.strictEqual(Tracking.getUser(), null);
});

test("logEvent no explota sin usuario ni fetch global", () => {
  delete global.localStorage;
  assert.doesNotThrow(() => Tracking.logEvent("generar_booleano", { red: "linkedin" }));
});

test("logEvent arma el payload con nombre, apellido, evento y extra", () => {
  global.localStorage = fakeStorage();
  Tracking.setUser("Ale", "Gorino");
  let sentBody = null;
  global.fetch = (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return Promise.resolve({ ok: true });
  };
  Tracking.logEvent("generar_booleano", { red: "github" });
  assert.strictEqual(sentBody.nombre, "Ale");
  assert.strictEqual(sentBody.apellido, "Gorino");
  assert.strictEqual(sentBody.evento, "generar_booleano");
  assert.strictEqual(sentBody.red, "github");
  assert.ok(sentBody.timestamp);
  delete global.localStorage;
  delete global.fetch;
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
