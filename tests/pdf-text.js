const assert = require("assert");
const PdfText = require("../js/pdf-text.js");
const Extractor = require("../js/extractor.js");
const Generator = require("../js/generator.js");
const Networks = require("../js/networks.js");

const items = [
  { str: "Código WC-123", hasEOL: true },
  { str: "Auditor", hasEOL: true },
  { str: "OBJETIVO DEL PUESTO", hasEOL: true },
  { str: "Auditar instalaciones de telecomunicaciones con Ekahau y nPerf.", hasEOL: true },
  { str: "CONOCIMIENTOS TÉCNICOS", hasEOL: true },
  { str: "Baja tensión y equipos de certificación.", hasEOL: true },
  { str: "Puede ascender a TIER II y TIER III.", hasEOL: true },
  { str: "Creada por", hasEOL: true },
  { str: "Puesto: Puesto: Recibido y conforme Nombre: Puesto: Esta descripción", hasEOL: true },
];
const text = PdfText.extractTextItems(items);
assert.ok(text.includes("Auditor\nOBJETIVO"), "se deben preservar los saltos de línea");
const result = Extractor.analyzeJD(text, { fileName: "AUDITORES (ESPAÑA).pdf" });
assert.deepStrictEqual(result.rol, ["Auditor"]);
assert.ok(result.atributos.includes("Ekahau") && result.atributos.includes("nPerf"));
assert.ok(!result.rol[0].includes("Tier"));
assert.deepStrictEqual(result.alcance, [], "el nombre del archivo no debe imponer el país");
assert.strictEqual(result.fileCountrySuggestion, "España");
assert.ok(result.quality.warnings.some((warning) => warning.includes("nombre del archivo")));
const native = Generator.buildLinkedinBooleanTiers(result);
assert.ok(native[0].query.includes("Auditor AND telecomunicaciones"));
assert.ok(native.some((tier) => tier.label.includes("sin título") && tier.query.includes("Ekahau")));
assert.ok(!native.some((tier) => tier.query.includes("España")), "la ubicación requiere confirmación");
assert.ok(Networks.recommendNetworks(result).some((item) => item.id === "linkedin"));
assert.ok(!Networks.recommendNetworks(result).some((item) => item.id === "github"));

const tech = Networks.recommendNetworks({ rol: ["Backend Developer"], atributos: ["Python"], dominio: [], alcance: ["Argentina"] });
assert.ok(tech.some((item) => item.id === "github"));
const design = Networks.recommendNetworks({ rol: ["UX Designer"], atributos: ["Figma"], dominio: [], alcance: ["España"] });
assert.ok(design.some((item) => item.id === "behance"));
const city = Extractor.analyzeJD("Buscamos Backend Developer con Python y Django en Buenos Aires, Argentina.");
assert.ok(Generator.buildUniversalBoolean(city).includes('"Buenos Aires"'));
assert.ok(!Generator.buildUniversalBoolean(city).includes("Argentina OR"), "una ciudad no se debe ampliar a todo el país");
assert.ok(decodeURIComponent(Generator.buildGithubPeopleUrl(city)).includes('location:"Buenos Aires"'));

console.log("PDF, validación, alcance y recomendaciones: 18 checks passed");
