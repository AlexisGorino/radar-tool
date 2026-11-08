// Fallos reales del extractor hallados probando JDs de áreas variadas; cada caso fija el arreglo.
const assert = require("node:assert/strict");
const Extractor = require("../js/extractor.js");

const analyze = (text) => Extractor.analyzeJD(text);

// "Nice to have" no es la ciudad de Niza (el país salía Francia).
for (const phrase of ["Nice to have: SQL", "Nice-to-have: SQL"]) {
  const a = analyze(`Marketing Manager (remoto, LATAM)\nRequirements: 5+ years in B2B SaaS marketing, HubSpot, strong English. ${phrase}`);
  assert.equal(a.country, null, `"${phrase}" no debe fijar país`);
  assert.deepEqual(a.rol, ["Marketing Manager"], `la modalidad entre paréntesis no es parte del cargo (${phrase})`);
}
// La ciudad real sigue detectándose.
assert.equal(analyze("Backend Developer based in Nice, France. Python, Django, PostgreSQL, Docker.").country, "Francia");

// "Semi Senior" es un nivel propio y no se pega al cargo.
const rrhh = analyze("Analista de Recursos Humanos Semi Senior - Bogotá, Colombia\nReclutamiento, onboarding y administración de personal. 3 años en posiciones similares.");
assert.deepEqual(rrhh.rol, ["Analista de Recursos Humanos"]);
assert.deepEqual(rrhh.seniority, ["semi senior"]);

// La ciudad al final del título no forma parte del cargo; "Meta Ads" tampoco se confunde con ciudad.
assert.deepEqual(analyze("Jefe de Logística y Compras - Buenos Aires\nGestión de proveedores, stock y SAP MM. 5 años de experiencia.").rol, ["Jefe de Logística y Compras"]);
assert.deepEqual(analyze("Paid Media Specialist - Meta Ads\nGoogle Ads, Meta Ads y analítica. 3 años de experiencia.").rol, ["Paid Media Specialist - Meta Ads"]);

// La experiencia se lee en cualquier orden y en español, inglés y portugués.
assert.deepEqual(analyze("Gerente de Ventas Retail - Monterrey, México\nResponsable de 12 tiendas. 6 años de experiencia. Presencial.").roleContext, ["Experiencia indicada: 6 años"]);
assert.deepEqual(analyze("Desenvolvedor Backend Pleno - São Paulo, Brasil\nJava, Spring Boot. Experiência de 4 anos. Regime híbrido.").roleContext, ["Experiencia indicada: 4 anos"]);
assert.match(analyze("Senior QA Engineer, Madrid, España. Cypress and Playwright. 5+ years of experience.").roleContext.join(" "), /5\+? ?years/);

// "Zona norte GBA" ubica la búsqueda en Argentina.
const admin = analyze("Asistente administrativo contable junior, zona norte GBA.\nFacturación, cobranzas, Tango y Excel.");
assert.equal(admin.country, "Argentina");
assert.ok(admin.alcance.includes("GBA"));

console.log("Extractor regressions passed.");
