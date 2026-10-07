const assert = require("assert");
const Outcome = require("../js/outcome.js");

function memoryStorage() {
  const values = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
  };
}

const storage = memoryStorage();
assert.strictEqual(Outcome.record(storage, "linkedin", "relevant"), true);
assert.strictEqual(Outcome.record(storage, "linkedin", "noisy"), true);
assert.strictEqual(Outcome.record(storage, "linkedin", "empty"), true);
assert.deepStrictEqual(Outcome.read(storage).linkedin, { relevant: 1, noisy: 1, empty: 1 });
assert.strictEqual(Outcome.total(Outcome.read(storage).linkedin), 3);
assert.deepStrictEqual(Object.keys(JSON.parse(storage.getItem(Outcome.KEY)).linkedin).sort(), ["empty", "noisy", "relevant"]);
assert.strictEqual(Outcome.record(storage, "linkedin", "candidate-name"), false);
assert.strictEqual(Outcome.record(storage, "", "empty"), false);
assert.deepStrictEqual(Outcome.read({ getItem: () => "malformed" }), {});
console.log("outcome feedback tests passed");
