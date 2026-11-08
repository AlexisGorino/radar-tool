const assert = require("node:assert/strict");
const Extractor = require("../js/extractor.js");
const Radarcito = require("../js/radarcito.js");
const Knowledge = require("../js/radarcito-knowledge.js");

const jd = Radarcito.EXAMPLE_JD;
const analysis = Extractor.analyzeJD(jd);
const ask = (question, text = jd) => Radarcito.answer(question, text, text === jd ? analysis : Extractor.analyzeJD(text));
const flat = (r) => `${r.text} ${r.quotes.join(" ")} ${r.list.join(" ")}`;

// Preguntas frecuentes sobre la JD de ejemplo.
assert.match(ask("¿Qué tecnologías piden?").text, /Playwright/);
assert.match(ask("¿Qué tecnologías piden?").text, /Suman si los tiene:.*Docker/, "Lo valorable no se presenta como excluyente");
assert.match(ask("¿Qué nivel de seniority buscan?").text, /Senior/);
assert.match(ask("¿Es remoto o presencial?").text, /híbrid/i);
assert.match(flat(ask("¿Qué idiomas piden?")), /Inglés avanzado/);
assert.match(flat(ask("¿Hay salario?")), /40\.000/);
assert.match(flat(ask("¿Qué beneficios ofrecen?")), /seguro médico/);
assert.match(flat(ask("¿Qué tipo de contrato es?")), /indefinido/);
assert.match(flat(ask("¿Qué funciones tiene?")), /framework de pruebas/);
assert.match(ask("Resumime la JD").text, /Senior QA Automation Engineer/);
assert.match(flat(ask("¿Dónde conviene buscar?")), /GitHub/);

// Lo que no figura se dice con honestidad, sin inventar.
const bare = "Buscamos contador/a con experiencia en conciliaciones bancarias en Buenos Aires, Argentina.";
assert.match(ask("¿Hay salario?", bare).text, /No veo ninguna referencia salarial/);
assert.match(ask("¿Qué idiomas piden?", bare).text, /No veo idiomas/);
assert.doesNotMatch(flat(ask("¿Dónde conviene buscar?", bare)), /GitHub/, "Un rol no técnico no recibe el consejo de GitHub");

// Sin intención reconocida: busca frases en el texto; si no hay nada, lo admite.
assert.match(flat(ask("¿Mencionan algo de pipeline?")), /pipeline/i);
assert.match(ask("¿Cuál es el color favorito del CEO?").text, /no figura/i);

// Conocimiento general: funciona sin JD y cubre IT y no IT, en lenguaje de recruiter.
assert.match(flat(Radarcito.answer("¿Qué es Kubernetes?", "", null)), /contenedores/);
assert.match(flat(Radarcito.answer("qué hace un data engineer", "", null)), /tuberías/);
assert.match(flat(Radarcito.answer("preguntas para entrevistar a un contador", "", null)), /sistema contable/);
assert.match(flat(Radarcito.answer("¿Qué es una conciliación bancaria?", "", null)), /banco/);
assert.match(flat(Radarcito.answer("diferencia entre devops y sre", "", null)), /DevOps.*SRE/s);
assert.match(flat(Radarcito.answer("equivalentes de analista contable", "", null)), /Accountant/);
assert.match(flat(Radarcito.answer("señales de alerta de un vendedor", "", null)), /Alerta/);
assert.match(flat(Radarcito.answer("kubernetes", "", null)), /Orquesta/, "Una sigla suelta se interpreta como pregunta de definición");

// Con JD: términos explicados, preguntas y hunting salen del cargo real y de sus conocimientos.
assert.match(flat(ask("Explicame los términos técnicos de la JD")), /Playwright:/);
assert.match(flat(ask("¿Qué preguntas le hago al candidato?")), /proyecto concreto donde usaste Playwright/);
assert.match(flat(ask("¿Cómo hunteo este perfil?")), /SDET/);

// Hunting y equivalentes ofrecen cargar los títulos como alternativas del cargo.
const hunt = ask("¿Cómo hunteo este perfil?");
assert.equal(hunt.apply.field, "rol");
assert.ok(hunt.apply.terms.includes("SDET") && hunt.apply.terms.length <= 4);
assert.equal(new Set(hunt.apply.terms).size, hunt.apply.terms.length);
assert.deepEqual(Radarcito.answer("equivalentes de analista contable", "", null).apply.terms.slice(0, 2), ["Contador", "Accountant"]);
assert.equal(ask("¿Qué es Kubernetes?").apply, null, "Las definiciones no cargan nada en la pantalla");

// Lo que la base no cubre ofrece consultar a la IA, y lo que sí cubre no.
assert.equal(Radarcito.answer("¿Cuál es la capital de Francia?", "", null).ask, true);
assert.equal(Radarcito.answer("¿Qué es zxqvbn?", "", null).ask, true);
assert.equal(ask("¿Qué es Kubernetes?").ask, false);
assert.equal(ask("¿Qué es excluyente?").ask, false, "Una pregunta sobre la JD no es un hueco de la base");

// El glosario no se dispara con palabras comunes ("redes sociales", "2 pm").
assert.deepEqual(Knowledge.termsIn("Manejo de redes sociales y reuniones a las 2 pm en el centro."), []);

// Años de experiencia sin nivel explícito se traducen a seniority.
assert.match(ask("¿Qué nivel piden?", "Buscamos analista con 6 años de experiencia en Madrid.").text, /senior/i);

// Sin JD, pide cargarla; con pregunta vacía, ofrece sugerencias.
assert.match(Radarcito.answer("¿Qué idiomas piden?", "", null).text, /Pegá una/);
assert.match(Radarcito.answer("hola", "", null).text, /Radarcito/);
assert.ok(Radarcito.answer("  ", jd, analysis).followUps.length > 0);

// La guía sigue el flujo real: cada estado produce un consejo y un atajo distinto.
const ids = [
  [{}, "empty"], [{ hasText: true }, "ready"], [{ hasText: true, criteriaCount: 3 }, "criteria"],
  [{ hasText: true, criteriaCount: 3, reviewVisible: true }, "review"], [{ resultsVisible: true, criteriaCount: 3 }, "results"],
  [{ resultsVisible: true, profilesVisible: true }, "profiles"],
].map(([state, expected]) => { const s = Radarcito.stage(state); assert.equal(s.id, expected); assert.ok(s.ctas.length); return s.id; });
assert.equal(new Set(ids).size, ids.length);

// Cada paso del recorrido apunta a un control real de la pantalla.
const template = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src/app/app.component.html"), "utf8");
Radarcito.TOUR.filter((step) => step.target && step.target.startsWith("#")).forEach((step) => {
  assert.match(template, new RegExp(`id="${step.target.slice(1)}"`), `El recorrido apunta a ${step.target}, que no existe`);
});

// Integridad de la base: ningún alias repetido entre entradas y todos los perfiles completos.
[Knowledge.TERMS, Knowledge.ROLES].forEach((list) => {
  const aliasOwners = new Map();
  list.forEach((entry) => entry.a.forEach((alias) => {
    assert.ok(!aliasOwners.has(alias) || aliasOwners.get(alias) === entry.n, `alias "${alias}" repetido en "${entry.n}" y "${aliasOwners.get(alias)}"`);
    aliasOwners.set(alias, entry.n);
  }));
});
Knowledge.ROLES.forEach((role) => ["d", "s", "e", "q", "f"].forEach((key) => assert.ok(role[key] && role[key].length, `${role.n} sin "${key}"`)));

// Perfiles y términos ampliados: se reconocen por su nombre de uso común, sin falsos positivos de palabras corrientes.
[
  ["¿Qué hace un DBA?", /Bases de Datos/], ["¿Cómo hunteo un chofer de camión?", /Chofer/], ["¿Qué hace un pentester?", /SOC|Pentester/],
  ["¿Qué hace un community manager?", /Contenido|Comunicación/], ["¿Qué es Bejerman?", /Bejerman/], ["¿Qué es un PLC?", /PLC/],
  ["¿Qué hace un jefe de obra?", /Construcción/], ["¿Qué es GraphQL?", /GraphQL/],
].forEach(([question, expected]) => {
  const reply = Radarcito.answer(question, "", null);
  assert.equal(reply.ask, false, `"${question}" no debería derivar a la IA`);
  assert.match(`${reply.text} ${reply.list.join(" ")}`, expected, `"${question}"`);
});
assert.equal(Knowledge.findAllTerms("Buscamos equilibrio entre trabajo y vida, un balance sano y un equipo unido").length, 0, "palabras corrientes no son términos técnicos");

console.log("Radarcito: respuestas sobre la JD, honestidad ante datos ausentes, guía por paso y recorrido verificados.");
