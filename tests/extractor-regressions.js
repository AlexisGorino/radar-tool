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

// Portugués: "(a)" de género, nivel "Pleno" y guion final no forman parte del cargo.
const br = analyze("Desenvolvedor(a) Backend Pleno - Remoto (Brasil)\nBuscamos pessoa com 4 anos de experiência em Java, Spring Boot e Kafka.");
assert.deepEqual(br.rol, ["Desenvolvedor Backend"]);
assert.deepEqual(br.seniority, ["pleno"]);
assert.deepEqual(analyze("Technical Recruiter (IT) - Remoto desde México\nSourcing en LinkedIn y ATS. 3 años de experiencia.").rol, ["Technical Recruiter (IT)"]);
// "en pleno crecimiento" no es un nivel.
assert.deepEqual(analyze("Analista Contable\nEmpresa en pleno crecimiento. Tango y Excel. 3 años.").seniority, []);

// Títulos de más de 60 caracteres con ubicación conservan el cargo completo; la zona entre paréntesis se descarta.
assert.deepEqual(analyze("Ingeniero/a de Datos Semi Senior - Híbrido en Montevideo, Uruguay\nPython, SQL, Airflow y dbt. 3 años de experiencia.").rol, ["Ingeniero/a de Datos"]);
assert.deepEqual(analyze("Chofer de reparto (zona sur GBA)\nLicencia profesional B1. 2 años de experiencia.").rol, ["Chofer de reparto"]);

// Turno, "Jr" y la ciudad seguida de la modalidad entre paréntesis no forman parte del cargo.
assert.deepEqual(analyze("Enfermero/a Universitario/a - Turno noche (Córdoba)\nMatrícula vigente. 2 años de experiencia en terapia intensiva.").rol, ["Enfermero/a Universitario/a"]);
assert.deepEqual(analyze("Analista de Cuentas por Pagar Jr - Buenos Aires\nControl de facturas y SAP. Hasta 2 años de experiencia.").rol, ["Analista de Cuentas por Pagar"]);
assert.deepEqual(analyze("SDR / Inside Sales - São Paulo (híbrido)\nProspecção outbound e HubSpot. 2 anos de experiência.").rol, ["SDR / Inside Sales"]);

// "un/a", ".NET", "Se requiere" y "Sobre el rol:" no rompen el cargo; "Vas" no es un condado de Hungría.
const dotnet = analyze("¡Estamos buscando un/a Desarrollador/a .NET Semi Senior!\nSobre el rol:\nVas a sumarte a un equipo ágil del sector bancario.\nRequisitos:\n- 3+ años de experiencia con C# y SQL Server\nModalidad híbrida en Vicente López.");
assert.deepEqual(dotnet.rol, ["Desarrollador/a .NET"]);
assert.equal(dotnet.country, "Argentina");
assert.deepEqual(analyze("Se requiere Contador/a Público/a para estudio contable en Mar del Plata.\nIVA, Ganancias y Tango. 4 años de experiencia.").rol, ["Contador/a Público/a"]);
// "Job Title:" es una etiqueta de cargo, y la frase siguiente al punto no se pega a la señal.
const titled = analyze("Job Title: Senior Data Analyst\nLocation: Mexico City (Hybrid)\nRequirements: 5+ years in analytics, strong SQL and experience with BigQuery. English C1.");
assert.deepEqual(titled.rol, ["Senior Data Analyst"]);
assert.ok(![...titled.atributos, ...titled.atributosDeseables].some((term) => /English/i.test(term)), "el idioma no se mezcla con la herramienta");
// Liderar "equipos" no es una habilidad.
assert.ok(!analyze("Líder de Soporte Técnico - Quito, Ecuador\nGestionar un equipo de 8 analistas, ServiceNow. 2 años liderando equipos. Inglés avanzado.").atributosDeseables.includes("equipo"));

console.log("Extractor regressions passed.");
