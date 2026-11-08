// Escenarios completos de Radarcito con JDs modelo (2 de IT, 2 de otras áreas): el análisis real del
// extractor más la batería de preguntas que haría un recruiter. Cada JD tiene sus propios resultados
// esperados; además, ninguna pregunta estándar puede caer en "consultar a la IA" ni dar datos inventados.
const assert = require("node:assert/strict");
const Extractor = require("../js/extractor.js");
const Radarcito = require("../js/radarcito.js");
const Knowledge = require("../js/radarcito-knowledge.js");
const SCENARIOS = require("./fixtures/radarcito-jds.js");

const flat = (r) => `${r.text} ${r.quotes.join(" ")} ${r.list.join(" ")}`;
const STANDARD = [
  "Resumime la JD", "¿Qué tecnologías piden?", "¿Qué nivel de seniority buscan?", "¿Es remoto o presencial?",
  "¿Qué idiomas piden?", "¿Hay salario?", "¿Qué es excluyente?", "¿Qué me falta aclarar?",
  "¿Qué preguntas le hago al candidato?", "¿Cómo hunteo este perfil?", "Explicame los términos técnicos de la JD",
];

for (const jd of SCENARIOS) {
  const analysis = Extractor.analyzeJD(jd.text);
  const ask = (question) => Radarcito.answer(question, jd.text, analysis);
  const label = `[${jd.id}]`;

  // Ninguna pregunta estándar se escapa a la IA ni queda vacía.
  STANDARD.forEach((question) => {
    const result = ask(question);
    assert.equal(result.ask, false, `${label} "${question}" no debería derivar a la IA`);
    assert.ok(flat(result).trim().length > 20, `${label} "${question}" quedó sin respuesta`);
  });

  assert.match(ask("Resumime la JD").text, jd.role, `${label} el resumen debe nombrar el cargo`);

  const stack = flat(ask("¿Qué tecnologías piden?"));
  jd.expect.stack.forEach((pattern) => assert.match(stack, pattern, `${label} conocimientos: falta ${pattern}`));
  if (jd.expect.optional) assert.match(stack, new RegExp(`Suman si los tiene:.*(?:${jd.expect.optional.source})`), `${label} lo valorable debe ir como opcional`);

  if (jd.expect.level) assert.match(ask("¿Qué nivel de seniority buscan?").text, jd.expect.level, `${label} nivel`);
  else assert.match(ask("¿Qué nivel de seniority buscan?").text, /semi senior|senior|junior|no veo/i, `${label} el nivel se deduce de los años`);

  assert.match(flat(ask("¿Es remoto o presencial?")), jd.expect.modality, `${label} modalidad`);

  const salary = ask("¿Hay salario?");
  if (jd.expect.salary) assert.match(flat(salary), jd.expect.salary, `${label} salario`);
  else assert.match(salary.text, /No veo ninguna referencia salarial/, `${label} sin salario no se inventa uno (ni se toma un impuesto por sueldo)`);

  const language = ask("¿Qué idiomas piden?");
  if (jd.expect.language) assert.match(flat(language), jd.expect.language, `${label} idiomas`);
  else assert.match(language.text, /No veo idiomas/, `${label} sin idiomas no se inventan`);

  const hunt = ask("¿Cómo hunteo este perfil?");
  assert.equal(hunt.apply.field, "rol", `${label} el hunting ofrece cargar títulos`);
  assert.match(hunt.apply.terms.join(" | "), jd.expect.hunt, `${label} títulos equivalentes`);

  const questions = ask("¿Qué preguntas le hago al candidato?");
  assert.ok(questions.list.length >= 4, `${label} preguntas de screening`);
  assert.match(questions.list.join(" "), /proyecto concreto donde usaste/, `${label} incluye preguntas de la propia JD`);

  const terms = ask("Explicame los términos técnicos de la JD");
  assert.ok(terms.list.length >= 2, `${label} glosario de la JD`);
}

// Casos puntuales que la prueba manual dejó al descubierto.
const byId = Object.fromEntries(SCENARIOS.map((jd) => [jd.id, jd]));
const answerFor = (id, question) => Radarcito.answer(question, byId[id].text, Extractor.analyzeJD(byId[id].text));

// "Desarrollador/a Backend Java" (con marca de género y palabras de más) igual se reconoce como Backend.
assert.equal(Knowledge.findRole("Desarrollador/a Backend Java Senior").n, "Backend Developer");
assert.equal(Knowledge.findRole("Backend Java Developer").n, "Backend Developer", "alias en otro orden");
assert.equal(Knowledge.findRole("un/a Ejecutivo/a Comercial").n, "Ejecutivo Comercial / Ventas");

// El extractor no leyó el cargo del contador: Radarcito lo sugiere por el texto y ofrece cargarlo.
const missingRole = answerFor("contador-cordoba", "¿Qué me falta aclarar?");
assert.match(flat(missingRole), /parece «Contador \/ Analista Contable»/);
assert.equal(missingRole.apply.terms[0], "Contador");
assert.doesNotMatch(missingRole.list.join(" "), /No pudimos identificar el título del puesto/, "el aviso genérico del extractor no se duplica");

// Herramientas que el extractor omitió pero la JD marca como excluyentes o valoradas.
assert.match(flat(answerFor("contador-cordoba", "¿Qué es excluyente?")), /Indispensables:.*Excel/);
assert.match(flat(answerFor("contador-cordoba", "Explicame los términos técnicos de la JD")), /Tango:/, "un término al final de la oración también se reconoce");
assert.match(flat(answerFor("devops-madrid", "¿Qué tecnologías piden?")), /Suman si los tiene:.*Ansible/);

// Palabras comunes no disparan el glosario: "cumplimiento de cuotas" no es Compliance, ni B2B una herramienta.
const sales = flat(answerFor("comercial-cdmx", "Explicame los términos técnicos de la JD"));
assert.doesNotMatch(sales, /Compliance/);
assert.doesNotMatch(flat(answerFor("comercial-cdmx", "¿Qué tecnologías piden?")), /Suman si los tiene:.*B2B/);

console.log(`Radarcito: ${SCENARIOS.length} JDs modelo recorridas con ${STANDARD.length} preguntas cada una, y casos de regresión de la prueba manual.`);
