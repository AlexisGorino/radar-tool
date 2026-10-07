// Representative, anonymized JDs plus document and decision regressions.
const assert = require("assert");
const Extractor = require("../js/extractor.js");
const Generator = require("../js/generator.js");
const PdfText = require("../js/pdf-text.js");
const Review = require("../js/review.js");

const cases = [
  {
    name: "Telecom Tier I · Islas Canarias",
    text: "Puesto: TIER I - Técnico/a instalador/a de telecomunicaciones. Buscamos experiencia en fibra óptica, FTTH y OTDR para instalaciones en Islas Canarias, España. Excel es deseable.",
    role: "instalador",
    location: "Islas Canarias",
    skill: "FTTH",
  },
  {
    name: "Auditoría telecom · España",
    text: "Puesto: Auditor de telecomunicaciones. Funciones: auditar instalaciones de red con Ekahau y nPerf en España. Se valoran conocimientos de baja tensión.",
    role: "auditor",
    location: "España",
    skill: "Ekahau",
  },
  {
    name: "Backend · Argentina",
    text: "Buscamos Backend Developer con Python, Django y AWS para Buenos Aires, Argentina. La experiencia con Docker es valorable.",
    role: "backend",
    location: "Buenos Aires",
    skill: "Python",
  },
  {
    name: "RRHH · México",
    text: "Puesto: Talent Acquisition Specialist. Requisitos: experiencia en ATS, sourcing y selección para Ciudad de México, México.",
    role: "talent acquisition",
    location: "Ciudad de México",
    skill: "ATS",
  },
  {
    name: "Finanzas · Perú",
    text: "Buscamos Analista Contable para Lima, Perú. Requisitos: NIIF, Excel avanzado y conciliaciones bancarias.",
    role: "analista contable",
    location: "Lima",
    skill: "NIIF",
  },
  {
    name: "Diseño · España",
    text: "Posición: UX Designer. Requisitos: Figma, investigación de usuarios y prototipado. Ubicación: Madrid, España.",
    role: "ux designer",
    location: "Madrid",
    skill: "Figma",
  },
];

for (const sample of cases) {
  const result = Extractor.analyzeJD(sample.text);
  assert.ok(result.isJobPosting, `${sample.name}: debe reconocer una JD`);
  assert.ok(result.rol.some((role) => role.toLowerCase().includes(sample.role)), `${sample.name}: cargo ${result.rol}`);
  assert.ok(result.alcance.includes(sample.location), `${sample.name}: ubicación ${result.alcance}`);
  assert.ok(result.atributos.some((skill) => skill.toLowerCase() === sample.skill.toLowerCase()), `${sample.name}: skill ${result.atributos}`);
  assert.deepStrictEqual(Review.pendingQuestions(result), ["role", "requirements", "location"], `${sample.name}: confirmar decisiones`);
  assert.strictEqual(Review.canApply(result), false, `${sample.name}: no aplicar sin revisión`);
  assert.ok(Generator.buildUniversalBoolean(result).includes(sample.location === "España" ? "España" : sample.location), `${sample.name}: geografía en query`);
  for (const question of ["role", "requirements", "location"]) Review.accept(result, question);
  assert.strictEqual(Review.canApply(result), true, `${sample.name}: aplicar tras revisión`);
}

const sparse = PdfText.inspectPage([{ str: "Auditor", hasEOL: true }], 2);
assert.strictEqual(sparse.wordCount, 1);
const ordered = PdfText.inspectPage(Array.from({ length: 60 }, (_, index) => ({
  str: "requisito ", transform: [1, 0, 0, 1, 20, 800 - index * 12], hasEOL: true,
})), 3);
assert.strictEqual(ordered.suspectedReadingOrder, false);
const interleaved = PdfText.inspectPage(Array.from({ length: 60 }, (_, index) => ({
  str: "requisito ", transform: [1, 0, 0, 1, index % 2 ? 310 : 20, index % 2 ? 700 : 400], hasEOL: true,
})), 4);
assert.strictEqual(interleaved.suspectedReadingOrder, true);
const meta = PdfText.summarizePages([
  PdfText.inspectPage([{ str: "Buscamos Auditor con Ekahau, nPerf y experiencia de campo en Madrid, España.", hasEOL: true }], 1),
  sparse,
]);
assert.deepStrictEqual(meta.sparsePages, [2]);
assert.deepStrictEqual(PdfText.summarizePages([ordered, interleaved]).orderPages, [4]);
const incomplete = Extractor.analyzeJD("Buscamos Auditor con Ekahau y nPerf en Madrid, España.", { sourceMeta: meta });
assert.strictEqual(incomplete.quality.requiresSourceReview, true);
assert.ok(Review.pendingQuestions(incomplete).includes("source"));
assert.strictEqual(Review.canApply(incomplete), false);
for (const question of Review.pendingQuestions(incomplete)) Review.accept(incomplete, question);
assert.strictEqual(Review.canApply(incomplete), true);

const unreadable = Extractor.analyzeJD("Buscamos Auditor", {
  sourceMeta: { pageCount: 1, totalWords: 2, sparsePages: [1], orderPages: [] },
});
assert.strictEqual(unreadable.quality.blocked, true);
for (const question of Review.pendingQuestions(unreadable)) Review.accept(unreadable, question);
assert.strictEqual(Review.canApply(unreadable), false, "un PDF ilegible no se aplica aunque se confirmen preguntas");

const resume = Extractor.analyzeJD("Curriculum Vitae\nAna Perez\nana@example.com\nExperiencia en Python y AWS, Buenos Aires, Argentina.");
assert.strictEqual(resume.isResume, true);
for (const question of Review.pendingQuestions(resume)) Review.accept(resume, question);
assert.strictEqual(Review.canApply(resume), false);

const noLocation = Extractor.analyzeJD("Buscamos Backend Developer con Python y Django para proyectos de tecnología.");
assert.deepStrictEqual(noLocation.alcance, []);
Review.accept(noLocation, "role");
Review.accept(noLocation, "requirements");
assert.deepStrictEqual(Review.pendingQuestions(noLocation), ["location"]);
Review.accept(noLocation, "location");
assert.strictEqual(Review.canApply(noLocation), true, "una JD breve puede continuar con confirmación explícita");

const ownWords = Extractor.analyzeJD("Quiero alguien para atender caja y reponer mercadería en Rosario");
assert.deepStrictEqual(ownWords.rol, [], "'alguien' no debe convertirse en título");
assert.deepStrictEqual(Review.pendingQuestions(ownWords), ["intent", "role", "requirements", "location"]);
ownWords.isBrief = true;
ownWords.rol = ["Cajero"];
ownWords.atributos = ["atención de caja"];
for (const question of ["role", "requirements", "location"]) Review.accept(ownWords, question);
assert.strictEqual(Review.canApply(ownWords), true, "brief manual completo debe poder buscarse");

const vagueTech = Extractor.analyzeJD("Busco una persona que audite instalaciones de telecom en Canarias, con Ekahau y nPerf");
assert.deepStrictEqual(vagueTech.rol, [], "el relato no debe pasar por título");
for (const question of ["role", "requirements", "location"]) Review.accept(vagueTech, question);
assert.strictEqual(Review.canApply(vagueTech), true, "dos señales más sector permiten buscar sin título");

const tooBroad = Extractor.analyzeJD("Buscamos Recepcionista en Córdoba, Argentina.");
for (const question of ["role", "requirements", "location"]) Review.accept(tooBroad, question);
assert.strictEqual(Review.canApply(tooBroad), false, "título y ciudad no bastan sin una señal diferenciadora");

console.log(`${cases.length} JDs y controles de revisión/documento: OK`);
