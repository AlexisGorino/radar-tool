// Radarcito: el cerebro de la mascota guía de RADAR. Funciones puras y sin red:
// responde preguntas sobre la JD a partir de lo que el extractor ya entendió
// más la búsqueda de frases en el propio texto, y decide qué consejo darle a
// la persona según en qué paso del flujo está. Nada sale del navegador.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./radarcito-knowledge.js"));
  else root.RadarRadarcito = factory(root.RadarRadarcitoKnowledge);
})(typeof self !== "undefined" ? self : this, function (KB) {
  "use strict";

  const norm = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const unique = (list) => [...new Set(list.filter(Boolean))];
  const OPTIONAL_CUE = /(?:^|[^a-z])(?:valora|valorad|valorable|desead|deseable|plus|nice|aprecia|ideal|opcional|bonus|diferencial)/;

  const EXAMPLE_JD = [
    "Buscamos Senior QA Automation Engineer para sumarse a nuestro equipo en Barcelona, España.",
    "Modalidad híbrida: 2 días por semana en la oficina.",
    "Requisitos: más de 4 años de experiencia con Playwright, TypeScript y CI/CD. Inglés avanzado (B2 o superior).",
    "Se valora conocimiento de Docker y AWS.",
    "Funciones: diseñar el framework de pruebas automatizadas, integrarlo al pipeline y acompañar a otros testers.",
    "Ofrecemos contrato indefinido, salario de 40.000 a 50.000 EUR brutos anuales, seguro médico y formación continua.",
  ].join("\n");

  const SUGGESTIONS = [
    "Resumime la JD",
    "Explicame los términos técnicos de la JD",
    "¿Qué preguntas le hago al candidato?",
    "¿Cómo hunteo este perfil?",
    "¿Qué es excluyente?",
    "¿Qué me falta aclarar?",
    "¿Hay salario?",
    "¿Qué idiomas piden?",
  ];

  function sentencesOf(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .split(/\n+|(?<=[.!?;])\s+/)
      .map((line) => line.replace(/^[\s\-*•·▪●\d.)]+/, "").trim())
      .filter((line) => line.length > 3)
      .map((line) => ({ raw: line.length > 280 ? `${line.slice(0, 277)}…` : line, n: norm(line) }));
  }

  const pick = (ctx, pattern, max = 2) => ctx.sentences.filter((s) => pattern.test(s.n)).slice(0, max).map((s) => s.raw);

  function yearsIn(ctx) {
    const range = ctx.n.match(/(\d{1,2})\s*(?:a|y|-|–)\s*(\d{1,2})\s*\+?\s*(?:anos|years?)/);
    if (range) return { min: Number(range[1]), label: `${range[1]} a ${range[2]} años` };
    const single = ctx.n.match(/(\d{1,2})\s*\+?\s*(?:anos|years?|yrs)\b/);
    return single ? { min: Number(single[1]), label: `${single[1]}+ años` } : null;
  }

  function seniorityIn(ctx) {
    const labels = [...(ctx.a.seniority || [])];
    const table = [
      [/\b(trainee|pasante|intern)\b/, "Trainee"],
      [/\b(junior|jr)\b/, "Junior"],
      [/\b(semi[ -]?senior|ssr)\b/, "Semi Senior"],
      [/\b(senior|sr)\b/, "Senior"],
      [/\b(lead|lider|head of|principal|staff)\b/, "Lead"],
    ];
    table.forEach(([pattern, label]) => { if (pattern.test(ctx.n) && !labels.some((l) => norm(l) === norm(label))) labels.push(label); });
    // "Semi Senior" también contiene "senior": si aparece la forma larga, no informamos las dos.
    return labels.length > 1 && labels.some((l) => norm(l).startsWith("semi")) ? labels.filter((l) => norm(l) !== "senior") : labels;
  }

  // list: viñetas opcionales. ask: la base local no alcanzó, la UI puede ofrecer consultar a la IA.
  function reply(text, quotes = [], followUps = [], extra = {}) {
    return { text, quotes, followUps, list: extra.list || [], ask: Boolean(extra.ask) };
  }

  const missing = (what, advice) => reply(`No veo ${what} en la JD. ${advice}`, [], ["Resumime la JD", "¿Qué me falta aclarar?"]);

  const INTENTS = [
    {
      test: /salari|sueldo|remunera|cuanto pagan|pagan|compensaci|banda|tarifa|brut|neto/,
      run(ctx) {
        const quotes = pick(ctx, /(\$|usd|eur|€|£|ars|salari|sueldo|remunera|compensaci|banda salarial|brutos|netos)/, 2)
          .filter((line) => /\d|salari|sueldo|remunera|compensaci/i.test(line));
        return quotes.length
          ? reply("Sí, la JD habla de remuneración:", quotes, ["¿Qué beneficios ofrecen?", "¿Qué tipo de contrato es?"])
          : missing("ninguna referencia salarial", "Conviene confirmarla con quien te pidió la búsqueda antes de contactar candidatos.");
      },
    },
    {
      test: /idioma|ingles|english|portugues|frances|aleman|italiano|catalan|bilingue/,
      run(ctx) {
        const quotes = pick(ctx, /\b(ingles|english|portugues|frances|aleman|italiano|catalan|bilingue|idioma|b1|b2|c1|c2)\b/, 3);
        return quotes.length
          ? reply("Esto dice sobre idiomas:", quotes, ["¿Qué tecnologías piden?", "¿Qué es excluyente?"])
          : missing("idiomas pedidos", "Si el equipo trabaja en otro idioma, aclaralo antes de buscar.");
      },
    },
    {
      test: /contrato|jornada|full.?time|part.?time|freelance|indefinid|temporal|relacion de dependencia|monotribut|autonom/,
      run(ctx) {
        const quotes = pick(ctx, /(contrato|indefinid|temporal|freelance|jornada|full.?time|part.?time|tiempo completo|medio tiempo|relacion de dependencia|monotribut|autonom)/, 2);
        return quotes.length
          ? reply("Sobre el tipo de contratación:", quotes, ["¿Hay salario?"])
          : missing("el tipo de contrato", "Es un dato que los candidatos suelen preguntar primero.");
      },
    },
    {
      test: /benefici|ofrecen|ofrece|perks|prepaga|obra social|bonus|vacaciones/,
      run(ctx) {
        const quotes = pick(ctx, /(benefici|ofrecemos|ofrece|seguro|obra social|prepaga|bonus|bono|vacaciones|capacitaci|formacion continua|flexib|home office)/, 3);
        return quotes.length
          ? reply("Esto es lo que ofrece la empresa:", quotes, ["¿Hay salario?"])
          : missing("beneficios mencionados", "Sin ellos, el mensaje al candidato se apoya solo en el proyecto.");
      },
    },
    {
      test: /estudio|titulo|formaci|carrera|grado|universit|licenciatura|ingenieria|master|posgrado/,
      run(ctx) {
        const quotes = pick(ctx, /(grado|licenciatura|ingenieria|titulo|universitari|master|posgrado|bachelor|estudios|carrera|formacion academica)/, 2);
        return quotes.length
          ? reply("Sobre estudios y formación:", quotes, ["¿Qué es excluyente?"])
          : missing("requisitos de estudios", "Si el título no es obligatorio, mejor no usarlo como filtro.");
      },
    },
    {
      test: /funcion|tarea|responsabilidad|dia a dia|que hara|que haria|que va a hacer|que hace|encargad/,
      run(ctx) {
        const quotes = pick(ctx, /(funcion|responsabilidad|tarea|\bvas a\b|seras|encargad|desarroll|disen|lider|gestion|implement|coordin|mantener|analiz|acompan|integr)/, 4);
        return quotes.length
          ? reply("Esto es lo que haría la persona en el puesto:", quotes, ["¿Qué tecnologías piden?", "Resumime la JD"])
          : missing("una lista de funciones", "Preguntale al cliente qué hará en su día a día; ayuda a elegir mejores palabras clave.");
      },
    },
    {
      test: /busco|buscar|buscamos|fuente|linkedin|github|upwork|fiverr|empiezo|primero|por donde|red(es)?\b/,
      run(ctx) {
        const role = norm([...(ctx.a.rol || []), ...(ctx.a.atributos || [])].join(" "));
        const technical = /(developer|desarroll|engineer|ingenier|software|qa|devops|data|backend|frontend|fullstack|cloud|sre|java|python|react|node|typescript|playwright|\.net|sap)/.test(role || ctx.n);
        return technical
          ? reply("Para un perfil técnico, empezaría por GitHub (código público, filtrado por país) y LinkedIn con X-Ray. Upwork y Fiverr sirven si aceptás freelance. Los resultados siempre los revisás vos antes de contactar.", [], ["¿Qué tecnologías piden?", "¿Es remoto o presencial?"])
          : reply("Para este perfil, LinkedIn con X-Ray es la mejor primera fuente. GitHub aporta poco si no es un rol técnico. Los resultados siempre los revisás vos antes de contactar.", [], ["¿Qué me falta aclarar?"]);
      },
    },
    {
      test: /donde es|ubicaci|ciudad|pais|remot|hibrid|presencial|modalidad|oficina|lugar|sede/,
      run(ctx) {
        const places = (ctx.a.alcance || []).join(", ");
        const modality = unique([...(ctx.a.modality || []), ...["remoto", "híbrido", "presencial"].filter((m) => new RegExp(norm(m)).test(ctx.n))]);
        const quotes = pick(ctx, /(remot|hibrid|presencial|oficina|home office|ubicad|sede|dias por semana)/, 2);
        const parts = [`Ubicación: ${places || "no figura"}.`, `Modalidad: ${modality.join(", ") || "no figura"}.`];
        return reply(parts.join(" "), quotes, ["¿Qué me falta aclarar?", "¿Dónde conviene buscar?"]);
      },
    },
    {
      test: /senior|junior|seniority|semi|nivel|experiencia|anos|trayectoria/,
      run(ctx) {
        const levels = seniorityIn(ctx);
        const years = yearsIn(ctx);
        const quotes = pick(ctx, /(\d+\s*\+?\s*(anos|years?)|senior|junior|semi|experiencia)/, 2);
        if (levels.length) return reply(`Buscan nivel ${levels.join(" / ")}${years ? ` con ${years.label} de experiencia` : ""}.`, quotes, ["¿Qué tecnologías piden?"]);
        if (years) {
          const band = years.min >= 5 ? "senior" : years.min >= 2 ? "semi senior" : "junior";
          return reply(`La JD no nombra el nivel, pero pide ${years.label} de experiencia: equivale a un perfil ${band}.`, quotes, ["¿Qué tecnologías piden?"]);
        }
        return missing("el nivel ni los años de experiencia", "Definilo antes de buscar para no mezclar perfiles junior y senior.");
      },
    },
    {
      test: /tecnolog|stack|herramient|lenguaje|framework|skill|habilidad|conocimiento|excluyent|obligatori|imprescindible|indispensable|requisit|desead|valora|plus|piden|pide|necesit/,
      run(ctx) {
        const required = new Set(ctx.a.imprescindibles || []);
        const roleText = norm((ctx.a.rol || []).join(" "));
        const terms = unique([...required, ...(ctx.a.atributos || [])]).filter((term) => required.has(term) || !roleText.includes(norm(term)));
        const optional = [];
        const must = [];
        terms.forEach((term) => {
          const line = ctx.sentences.find((s) => s.n.includes(norm(term)));
          (!required.has(term) && line && OPTIONAL_CUE.test(line.n) ? optional : must).push(term);
        });
        if (!terms.length) return missing("herramientas o conocimientos concretos", "Probá sumar una o dos tecnologías a mano en el paso 2.");
        const years = yearsIn(ctx);
        const parts = [`${must.length ? `Indispensables: ${must.join(", ")}.` : ""}`, optional.length ? `Suman si los tiene: ${optional.join(", ")}.` : "", years ? `Además piden ${years.label} de experiencia.` : ""];
        return reply(parts.filter(Boolean).join(" "), [], ["¿Qué nivel de seniority buscan?", "¿Qué idiomas piden?"]);
      },
    },
    {
      test: /falta|aclarar|duda|ambig|riesgo|problema|vago|claro|confus/,
      run(ctx) {
        const a = ctx.a;
        const issues = [];
        if (!(a.rol || []).length) issues.push("no hay un cargo claro");
        if (!(a.alcance || []).length || a.locationNeedsClarification) issues.push("la ubicación no está clara");
        if ((a.ambiguousLocations || []).length) issues.push("hay ciudades que pueden ser de más de un país");
        if (a.experienceNeedsClarification || (!yearsIn(ctx) && !seniorityIn(ctx).length)) issues.push("no queda claro el nivel de experiencia");
        if (a.educationNeedsClarification) issues.push("hay que confirmar si el título es obligatorio");
        if (a.sectorNeedsClarification) issues.push("hay un término de sector que puede leerse de dos maneras");
        if ((a.unverifiedSignals || []).length) issues.push(`RADAR no está seguro de si “${a.unverifiedSignals.slice(0, 3).join("”, “")}” filtra o solo suma`);
        ((a.quality && a.quality.warnings) || []).slice(0, 2).forEach((warning) => issues.push(String(warning).replace(/\.$/, "").toLowerCase()));
        return issues.length
          ? reply(`Antes de buscar yo aclararía: ${issues.join("; ")}.`, [], ["Resumime la JD", "¿Dónde conviene buscar?"])
          : reply("La JD se lee bastante clara: hay cargo, ubicación y señales concretas. Igual revisá los criterios en el paso 2.", [], ["¿Dónde conviene buscar?"]);
      },
    },
    {
      test: /resum|de que (trata|va)|pocas palabras|explica|contame|en que consiste/,
      run(ctx) {
        const a = ctx.a;
        const level = seniorityIn(ctx).join(" / ");
        const years = yearsIn(ctx);
        const roleText = norm((a.rol || []).join(" "));
        const stack = unique([...(a.imprescindibles || []), ...(a.atributos || [])]).filter((term) => !roleText.includes(norm(term))).slice(0, 5);
        const lead = (a.rol || [])[0] ? `Es una búsqueda de ${a.rol[0]}${level && !norm(a.rol[0]).includes(norm(level)) ? ` (${level})` : ""}` : "La JD no deja claro el cargo";
        const where = unique([...(a.alcance || []).slice(-2), ...(a.modality || [])]).join(", ");
        const bits = [`${lead}${where ? ` · ${where}` : ""}.`, stack.length ? `Pide ${stack.join(", ")}.` : "", years ? `Experiencia: ${years.label}.` : ""];
        return reply(bits.filter(Boolean).join(" "), [], ["¿Qué es excluyente?", "¿Qué me falta aclarar?"]);
      },
    },
    {
      test: /ayuda|que podes|que sabes|que haces|como funciona|para que sirves/,
      run() {
        return reply("Puedo leer la JD que cargaste, explicarte cualquier término técnico o perfil (de IT o de otras áreas), sugerirte preguntas de entrevista y decirte cómo hunterear. Lo que no sepa, lo consulto a la IA de RADAR solo si vos lo pedís.", [], SUGGESTIONS.slice(0, 3));
      },
    },
  ];

  const STOP = new Set("para como esta este esto esos esas pero porque cual cuales quien donde cuando tiene tienen puede hace hacen sobre desde hasta entre ademas segun busca buscan piden pide jd puesto cargo perfil que con los las una uno del por mas muy".split(" "));

  // Si ninguna intención aplica, busca en el propio texto las frases más cercanas.
  function retrieve(ctx) {
    const stems = unique(ctx.q.split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
    const scored = stems.length
      ? ctx.sentences
          .map((s) => ({ s, score: stems.filter((stem) => s.n.split(/[^a-z0-9+#.]+/).some((w) => w.startsWith(stem))).length }))
          .filter((item) => item.score > 0)
          .sort((x, y) => y.score - x.score)
          .slice(0, 2)
      : [];
    return scored.length
      ? reply("Esto es lo más cercano que encontré en la JD:", scored.map((item) => item.s.raw), ["Resumime la JD", "¿Qué me falta aclarar?"])
      : reply("Eso no figura en la JD que cargaste ni en mi base. Puedo consultarlo a la IA de RADAR, o aclaralo con quien te pidió la búsqueda.", [], SUGGESTIONS.slice(0, 3), { ask: true });
  }

  // ---------- conocimiento general (IT y no IT), sin necesidad de JD ----------
  const LOOKUP = {
    define: /(que (es|son|significa|quiere decir)|significa|para que sirve|explicame|explicar|definicion|a que se refiere|de que se trata)/,
    role: /(que hace|que hacen|perfil de|como es un|funciones de|responsabilidades de|en que consiste|que es un|que es una)/,
    screening: /(pregunt|entrevist|screening|evaluo|evaluar|como filtro)/,
    equivalent: /(equivalente|titulos parecidos|otros nombres|como se llama tambien|sinonimo|tambien se llama|otros titulos|que otros)/,
    compare: /(diferencia|distinto|versus|\bvs\b|comparar)/,
    hunt: /(hunte|sourcing|como (lo |la |los |las )?busco|donde (lo |la |los |las )?(busco|encuentro)|boolean|como (lo |la )?encuentro|como consigo|conviene buscar)/,
    signs: /(senal|alerta|bandera|red flag|como detecto|como se que es bueno|buen candidato|que miro)/,
    jdTerms: /(termino|jerga|glosario|no entiendo|palabras tecnicas|siglas|explicame la jd|explicame esta jd)/,
  };
  const bullets = (items) => items.filter(Boolean);
  const unknown = (what) => reply(`No tengo ${what} en mi base. Puedo consultarlo a la IA de RADAR si querés.`, [], [], { ask: true });

  function roleFor(ctx) {
    const named = KB.findRole(ctx.q);
    if (named) return { role: named, fromJd: false };
    const fromJd = KB.findRole(`${(ctx.a.rol || []).join(" ")} ${ctx.text.slice(0, 200)}`);
    return fromJd ? { role: fromJd, fromJd: true } : null;
  }

  function roleCard(role) {
    return reply(`${role.n}: ${role.d}`, [], [`¿Qué preguntas le hago a un ${role.n.split(" / ")[0]}?`, `¿Cómo hunteo un ${role.n.split(" / ")[0]}?`], {
      list: bullets([`Suele saber: ${role.s.join(", ")}.`, `También se lo busca como: ${role.e.join(", ")}.`]),
    });
  }

  function knowledgeAnswer(ctx) {
    const { q } = ctx;
    if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|hey|que tal)(\s|$|[!.,?])/.test(q)) return reply("¡Hola! Soy Radarcito. Preguntame por una JD, por un término técnico, por qué hace un perfil de cualquier área o cómo encontrarlo.", [], SUGGESTIONS.slice(0, 4));
    if (LOOKUP.jdTerms.test(q)) {
      if (!ctx.text) return null;
      const terms = KB.termsIn(ctx.text, 8);
      return terms.length
        ? reply("Estos son los términos técnicos de la JD, en palabras simples:", [], ["¿Qué preguntas le hago al candidato?", "¿Qué es excluyente?"], { list: terms.map((t) => `${t.n}: ${t.d}`) })
        : reply("No encontré siglas ni tecnologías en la JD que necesiten explicación. Si algún término te confunde, preguntame por él: por ejemplo «¿qué es Kubernetes?».");
    }
    if (LOOKUP.compare.test(q)) {
      const terms = KB.findAllTerms(q);
      const roles = KB.findAllRoles(q);
      const pair = terms.length >= 2 ? terms.slice(0, 2).map((t) => `${t.n}: ${t.d}`) : roles.length >= 2 ? roles.slice(0, 2).map((r) => `${r.n}: ${r.d}`) : null;
      if (pair) return reply("Te los explico por separado para que se vea la diferencia:", [], [], { list: pair });
    }
    if (LOOKUP.hunt.test(q)) {
      const found = roleFor(ctx);
      if (found) {
        const { role } = found;
        const technical = KB.isIt(role);
        return reply(`Para encontrar ${role.n}, probá estos títulos: ${[role.n.split(" / ")[0], ...role.e].join(", ")}.`, [], ["¿Qué preguntas le hago?", "¿Qué señales de alerta tiene?"], {
          list: bullets([
            `Combiná el título con 2 o 3 de estos conocimientos: ${role.s.slice(0, 4).join(", ")}.`,
            technical ? "Fuentes: GitHub (código público por país), LinkedIn con X-Ray y comunidades técnicas." : "Fuentes: LinkedIn con X-Ray, bolsas de trabajo locales y grupos profesionales.",
            "En RADAR, cargá estos títulos como alternativas del cargo: alcanza con que coincida uno.",
          ]),
        });
      }
    }
    if (LOOKUP.screening.test(q)) {
      const found = roleFor(ctx);
      if (found) {
        const { role } = found;
        const required = unique([...(ctx.a.imprescindibles || []), ...(ctx.a.atributos || [])]).filter((term) => !norm((ctx.a.rol || []).join(" ")).includes(norm(term))).slice(0, 3);
        const own = found.fromJd ? required.map((term) => `Contame un proyecto concreto donde usaste ${term}: ¿qué problema resolviste?`) : [];
        return reply(`Preguntas útiles para un ${role.n}:`, [], [`¿Qué señales de alerta tiene?`, "Resumime la JD"], { list: [...role.q, ...own] });
      }
    }
    if (LOOKUP.equivalent.test(q)) {
      const found = roleFor(ctx);
      if (found) return reply(`A un ${found.role.n} también se lo busca como: ${found.role.e.join(", ")}. Cargalos como alternativas del cargo en RADAR para no perder perfiles.`, [], [`¿Cómo hunteo un ${found.role.n.split(" / ")[0]}?`]);
    }
    if (LOOKUP.signs.test(q)) {
      const found = roleFor(ctx);
      if (found) return reply(`Para un ${found.role.n} fijate en:`, [], ["¿Qué preguntas le hago?"], { list: [...found.role.s.slice(0, 4).map((s) => `Buena señal: ${s}.`), ...found.role.f.map((f) => `Alerta: ${f}.`)] });
    }
    if (LOOKUP.role.test(q) || LOOKUP.define.test(q)) {
      const term = KB.findTerm(q);
      const role = KB.findRole(q);
      const roleFirst = LOOKUP.role.test(q) && role;
      if (term && !roleFirst) return reply(`${term.n}: ${term.d}`, [], ["Explicame los términos de esta JD", "¿Qué preguntas le hago al candidato?"], { list: bullets([term.cv && `En un CV: ${term.cv}`]) });
      if (role) return roleCard(role);
      // Si la pregunta es sobre la JD ("¿qué es excluyente?") no es un hueco de la base: la responde la JD.
      if (!INTENTS.some((intent) => intent.test.test(q))) return unknown("ese dato");
    }
    // Una sola palabra o sigla suelta ("kubernetes", "qa automation"): se interpreta como "¿qué es?".
    if (q.split(/\s+/).length <= 4) {
      const term = KB.findTerm(q);
      if (term) return reply(`${term.n}: ${term.d}`, [], ["Explicame los términos de esta JD"], { list: bullets([term.cv && `En un CV: ${term.cv}`]) });
      const role = KB.findRole(q);
      if (role) return roleCard(role);
    }
    return null;
  }

  function answer(question, jdText, analysis) {
    const text = String(jdText || "").trim();
    const ctx = { q: norm(question), n: norm(text), text, sentences: sentencesOf(text), a: analysis || {} };
    if (!ctx.q.trim()) return reply("Escribime una pregunta o elegí una de las sugeridas.", [], SUGGESTIONS.slice(0, 4));
    const known = knowledgeAnswer(ctx);
    if (known) return known;
    const intent = INTENTS.find((candidate) => candidate.test.test(ctx.q));
    if (!text) {
      return intent
        ? reply("Todavía no cargaste ninguna JD. Pegá una arriba, o probá con un ejemplo y preguntame lo que quieras.", [], [])
        : reply("Esa pregunta no la tengo en mi base. Puedo consultarla a la IA de RADAR.", [], [], { ask: true });
    }
    return intent ? intent.run(ctx) : retrieve(ctx);
  }

  // Según el punto del flujo, qué le dice Radarcito y qué atajos ofrece.
  // kind: example | focus | click | scroll — la UI los ejecuta sobre el DOM.
  function stage(state) {
    if (state.profilesVisible) return { id: "profiles", message: "¡Ya hay perfiles! Abrí cada uno en su fuente, revisalo y marcá si la búsqueda fue relevante: así RADAR aprende qué red te sirve más.", ctas: [{ label: "Ver los perfiles", kind: "scroll", target: "#publicSearchResults" }] };
    if (state.resultsVisible) return { id: "results", message: "Las búsquedas están listas. Copiá una consulta y abrila en su portal, o pedí a RADAR que busque perfiles públicos por vos.", ctas: [{ label: "Buscar perfiles automáticamente", kind: "scroll", target: "#publicSearchSetup" }, { label: "Ver consultas", kind: "scroll", target: "#results" }] };
    if (state.reviewVisible) return { id: "review", message: "Esto es lo que entendí. Corregí lo que no cuadre y después tocá «Cargar perfil y revisar filtros». Todavía no busqué nada.", ctas: [{ label: "Ir a la revisión", kind: "scroll", target: "#jdReview" }] };
    if (state.criteriaCount > 0) return { id: "criteria", message: "Revisá cargo, conocimientos y ubicación. Los indispensables deben cumplirse todos; los relacionados, con uno alcanza. Cuando esté, tocá «Preparar búsquedas».", ctas: [{ label: "Ir a «Preparar búsquedas»", kind: "scroll", target: "#generateBtn" }] };
    if (state.hasText) return { id: "ready", message: "Perfecto. Ahora tocá «Leer y proponer criterios» y yo te muestro qué entendí antes de buscar.", ctas: [{ label: "Leer y proponer criterios", kind: "click", target: "#analyzeBtn" }] };
    return { id: "empty", message: "Pegá una JD arriba, adjuntá un PDF o Word, o contame con tus palabras a quién buscás. Si preferís, probá con un ejemplo.", ctas: [{ label: "Probar con un ejemplo", kind: "example" }, { label: "Ir a la descripción", kind: "focus", target: "#jdInput" }] };
  }

  const TOUR = [
    { target: null, title: "¡Hola, soy Radarcito!", text: "Soy tu guía en RADAR. En un minuto te muestro cómo armar una búsqueda sin saber Boolean ni tecnología. Podés saltarte esto cuando quieras." },
    { target: "#jdInput", title: "Contá a quién buscás", text: "Pegá la JD, escribí la idea con tus palabras o adjuntá un PDF o Word. Los PDF escaneados se leen en tu equipo." },
    { target: "#analyzeBtn", title: "Dejá que RADAR lea", text: "Tocá «Leer y proponer criterios». Te muestro qué entendí y no busco nada hasta que lo apruebes." },
    { target: ".radar-grid", title: "Revisá los criterios", text: "Cargo, conocimientos indispensables, alternativas y ubicación. Corregí lo que quieras: vos decidís qué filtra y qué solo suma." },
    { target: "#searchReadiness", title: "Elegí dónde buscar", text: "Preparás consultas para otros portales o pedís una lista de perfiles públicos. Las ampliaciones siempre requieren tu OK." },
    { target: null, title: "Preguntame lo que quieras", text: "En «Preguntar sobre la JD» te explico cualquier término técnico o perfil, de IT o de otra área, te sugiero preguntas de entrevista y te digo cómo hunterear. Estoy abajo a la derecha." },
  ];

  return { answer, stage, norm, sentencesOf, EXAMPLE_JD, SUGGESTIONS, TOUR };
});
