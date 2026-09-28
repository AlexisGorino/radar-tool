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

// detectLocationDetailed must title-case accented localities correctly —
// a naive \b-based regex mis-capitalizes accented letters (produced
// "NeuquÉN" and "MÉXico" instead of "Neuquén" and "México").
const localityCasingCases = [
  ["Vacante en Neuquén, Argentina.", "Argentina", "Neuquén"],
  ["Puesto en Ciudad de México.", "México", "Ciudad de México"],
  ["Rol en Jalisco, México.", "México", "Jalisco"],
];

localityCasingCases.forEach(([text, expectedCountry, expectedLocality]) => {
  test(`detectLocationDetailed capitalizes "${expectedLocality}" correctly`, () => {
    const { country, locality } = Countries.detectLocationDetailed(text);
    assert.strictEqual(country, expectedCountry);
    assert.strictEqual(locality, expectedLocality);
  });
});

// A locality can belong to more than one country's list — "Santiago" is
// both Chile's capital and half of "Santiago de Compostela" (Spain), "Lima"
// is both Perú's capital and a common surname. Verified live: a real JD for
// "Santiago de Compostela, España" came back as Chile, because Chile's
// locality list got checked before España's bare name ever got a chance —
// even though "España" was sitting right there. The country actually named
// in the text must always win over an ambiguous locality guess.
test("an explicit country name outranks an ambiguous locality match from a different, earlier-checked country", () => {
  const { country, locality } = Countries.detectLocationDetailed("100% presencial en Santiago de Compostela, España.");
  assert.strictEqual(country, "España");
  assert.strictEqual(locality, "Santiago de Compostela");
});

test("with no country named outright, an ambiguous locality still resolves via the old fallback order", () => {
  const { country } = Countries.detectLocationDetailed("Vacante en Santiago, modalidad híbrida.");
  assert.strictEqual(country, "Chile"); // LATAM checked before Europe when nothing disambiguates it
});

// Same ambiguity as above, but with no country name AND no comma-separated
// hint — just the bare locality. Chile's "santiago" is a whole-word match
// sitting inside España's own "santiago de compostela" at the exact same
// starting position, so it's not really a separate mention, it's a shorter
// read of the same words. The longer, more specific one wins.
test("a locality that's a strict prefix of a longer, more specific locality resolves to the longer one", () => {
  const { country, locality } = Countries.detectLocationDetailed("Buscamos alguien para trabajar en Santiago de Compostela.");
  assert.strictEqual(country, "España");
  assert.strictEqual(locality, "Santiago de Compostela");
});

// The prefix-collision override above must NOT fire for two unrelated
// mentions that just happen to share a word — a person's first name
// ("Santiago Ahmed") earlier in the text must not steal the country from
// a real, later locality ("CABA") just because "Santiago" alone is longer
// than "caba". Real JD, see tests/fixtures/pdf-modern-template-jd.txt.
test("an unrelated earlier name match doesn't override a real locality mentioned later", () => {
  const { country, locality } = Countries.detectLocationDetailed("Reporta a: Santiago Ahmed. Híbrido — Puerto Madero, CABA — Full Time.");
  assert.strictEqual(country, "Argentina");
  assert.strictEqual(locality, "CABA");
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) {
  failures.forEach((f) => console.log(`FAIL: ${f.name}\n  ${f.err.message}\n`));
  process.exit(1);
} else {
  console.log("All location checks passed.");
  process.exit(0);
}
