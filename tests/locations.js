// node tests/locations.js
// Province/state/region detection across every supported country, plus a
// check that common words don't false-positive into a country match.
const path = require("path");
const assert = require("assert");
const Countries = require(path.join(__dirname, "..", "js", "countries.js"));

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

const provinceCases = [
  ["Puesto remoto en Santa Fe, Argentina.", "Argentina"],
  ["Buscamos analista en Tucumán.", "Argentina"],
  ["Vacante en Neuquén, patagonia argentina.", "Argentina"],
  ["Rol basado en Chaco.", "Argentina"],
  ["Empresa con sede en la región de Biobío, Chile.", "Chile"],
  ["Buscamos vendedor en Antofagasta.", "Chile"],
  ["Puesto en Jalisco, México.", "México"],
  ["Vacante en Nuevo León.", "México"],
  ["Rol en Yucatán, modalidad híbrida.", "México"],
  ["Buscamos ingeniero en Antioquia, Colombia.", "Colombia"],
  ["Vacante en Valle del Cauca.", "Colombia"],
  ["Puesto en Cusco, Perú.", "Perú"],
  ["Buscamos en Piura.", "Perú"],
  ["Rol en Bahía, Brasil.", "Brasil"],
  ["Vacante en Rio Grande do Sul.", "Brasil"],
  ["Puesto en Cataluña, España.", "España"],
  ["Vacante en Andalucía.", "España"],
  ["Rol en el País Vasco.", "España"],
  ["Empresa alemana con sede en Baviera.", "Alemania"],
];

provinceCases.forEach(([text, expected]) => {
  test(`detects "${expected}" from province/region in: "${text}"`, () => {
    assert.strictEqual(Countries.detectCountry(text), expected);
  });
});

// Words that happen to look like a province/city but are common vocabulary
// or well-known brands unrelated to that place — must NOT false-positive.
const falsePositiveCases = [
  ["El candidato no salta de trabajo en trabajo, buena estabilidad laboral.", "Argentina", "salta (verb form) must not match Salta province"],
  ["Tiene experiencia trabajando para Banco Santander.", "México", "Santander (bank brand) must not match any Mexican-adjacent province term we might add later"],
];

falsePositiveCases.forEach(([text, notExpected, label]) => {
  test(`does not false-positive: ${label}`, () => {
    assert.notStrictEqual(Countries.detectCountry(text), notExpected);
  });
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) {
  failures.forEach((f) => console.log(`FAIL: ${f.name}\n  ${f.err.message}\n`));
  process.exit(1);
} else {
  console.log("All location checks passed.");
  process.exit(0);
}
