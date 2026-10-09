// UI layer. Talks to extractor.js / generator.js, never touches innerHTML with user input.
(function () {
  "use strict";

  const FIELDS = ["rol", "atributos", "imprescindibles", "deseables", "dominio", "alcance", "refinar"];
  const MAX_TXT_BYTES = 500 * 1024;
  const MAX_PDF_BYTES = 8 * 1024 * 1024;
  const MAX_DOCX_BYTES = 8 * 1024 * 1024;

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
  }

  const state = { rol: [], atributos: [], imprescindibles: [], deseables: [], dominio: [], alcance: [], refinar: [] };
  let selectedNetwork = "linkedin";

  // Qué tipo de perfil aparece en cada red y con qué confianza, según pruebas
  // en vivo (no supuestos): ver TESTING.md, sección "Auditoría de redes".
  const NETWORK_DESCRIPTIONS = {
    linkedin:
      "Perfiles profesionales de muchos rubros. La búsqueda interna requiere iniciar sesión y su filtro de ubicación debe confirmarse allí. Google X-Ray es una alternativa para páginas públicas indexadas; puede estar desactualizada.",
    github:
      "Útil para desarrollo, datos e infraestructura cuando hay proyectos o contribuciones públicas. Un repositorio no confirma experiencia laboral, residencia ni disponibilidad; evitá esta fuente para puestos sin actividad técnica pública.",
    stackoverflow:
      "Perfiles con participación pública en preguntas y respuestas, principalmente de tecnología. La actividad técnica puede aportar contexto, pero no equivale a historial laboral.",
    xing: "Red profesional con mayor uso en Alemania, Austria y Suiza. Fuera de esos mercados puede ofrecer poca cobertura; verificá país y ciudad en el perfil.",
    behance:
      "Portfolios públicos de diseño, UX/UI e ilustración. Sirve para evaluar trabajos publicados; no confirma empleo actual ni disponibilidad.",
    resumes:
      "Documentos de CV que los buscadores ya tienen indexados. Pueden estar antiguos o publicados fuera de contexto; comprobá la fuente y tratá los datos personales con cuidado.",
    custom:
      "Acota a un dominio que publique perfiles o portfolios. En portales de empleo el buscador puede devolver anuncios, no candidatos; verificá cada tipo de resultado.",
  };

  const NOTES = {
    linkedin: "X-Ray consulta páginas públicas de LinkedIn indexadas en Google. Puede omitir perfiles privados o mostrar datos antiguos; usá el filtro de ubicación de LinkedIn para confirmar la ciudad.",
    stackoverflow: "Busca páginas de perfiles con actividad pública. La coincidencia técnica es una señal para revisar, no una equivalencia con experiencia laboral.",
    xing: "Cobertura más fuerte en Alemania, Austria y Suiza. Los resultados indexados no reemplazan la verificación de residencia actual.",
    behance: "Busca portfolios públicos; evaluá trabajos y especialidad dentro del sitio.",
    resumes: "Busca archivos PDF/Word ya indexados; no consulta bases privadas ni confirma que el CV esté vigente.",
    custom: "El dominio solo limita páginas indexadas. Confirmá que cada resultado sea un perfil y no una oferta de empleo.",
  };

  const HISTORY_KEY = "radar-history-v1";
  const MAX_HISTORY = 20;

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  const jdInput = document.getElementById("jdInput");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const countrySelect = document.getElementById("countrySelect");
  const noLocationCheckbox = document.getElementById("noLocationCheckbox");
  const networkTabsEl = document.getElementById("networkTabs");
  const networkDescriptionEl = document.getElementById("networkDescription");
  const customSiteRow = document.getElementById("customSiteRow");
  const customSiteInput = document.getElementById("customSiteInput");
  const githubModeRow = document.getElementById("githubModeRow");
  const starsInputWrap = document.getElementById("starsInputWrap");
  const minStarsInput = document.getElementById("minStars");
  const publicSearchSources = document.getElementById("publicSearchSources");
  const findProfilesBtn = document.getElementById("findProfilesBtn");
  const checkProfilesConnectionBtn = document.getElementById("checkProfilesConnectionBtn");
  const publicSearchConfigNote = document.getElementById("publicSearchConfigNote");
  const publicSearchStatus = document.getElementById("publicSearchStatus");
  const publicSearchResults = document.getElementById("publicSearchResults");
  const publicSearchRefine = document.getElementById("publicSearchRefine");
  const publicSearchRefineTitle = document.getElementById("publicSearchRefineTitle");
  const publicSearchRefineText = document.getElementById("publicSearchRefineText");
  const broadenPublicSearchBtn = document.getElementById("broadenPublicSearchBtn");
  const resultsEl = document.getElementById("results");
  const resultXray = document.getElementById("resultXray");
  const resultGithub = document.getElementById("resultGithub");
  const resultLinkedinNative = document.getElementById("resultLinkedinNative");
  const synonymsRow = document.getElementById("synonymsRow");
  const synonymsList = document.getElementById("synonymsList");
  const aiRoleSuggestRow = document.getElementById("aiRoleSuggestRow");
  const aiSuggestBtn = document.getElementById("aiSuggestBtn");
  const aiSuggestHint = document.getElementById("aiSuggestHint");
  const aiAtributosRow = document.getElementById("aiAtributosRow");
  const aiAtributosList = document.getElementById("aiAtributosList");
  const jdReview = document.getElementById("jdReview");
  const jdReviewGrid = document.getElementById("jdReviewGrid");
  const jdReviewSummary = document.getElementById("jdReviewSummary");
  const jdReviewBadge = document.getElementById("jdReviewBadge");
  const jdReviewWarning = document.getElementById("jdReviewWarning");
  const aiAnalyzeJdBtn = document.getElementById("aiAnalyzeJdBtn");
  const jdReviewAiNote = document.getElementById("jdReviewAiNote");
  const jdReviewAiStatus = document.getElementById("jdReviewAiStatus");
  const xrayTiersEl = document.getElementById("xrayTiers");
  const generatorWarning = document.getElementById("generatorWarning");
  let pendingAnalysis = null;
  let jdNeedsReview = false;
  let currentFileName = "";
  let currentSourceMeta = null;
  let uploadSequence = 0;
  let publicSearchSequence = 0;
  let publicSearchRows = [];
  let publicSearchStrategy = "precise";
  const historyPanel = document.getElementById("historyPanel");
  const helpPanel = document.getElementById("helpPanel");
  const aiPanel = document.getElementById("aiPanel");
  const feedbackPanel = document.getElementById("feedbackPanel");
  const jdWarningPanel = document.getElementById("jdWarningPanel");
  const jdWarningMessage = document.getElementById("jdWarningMessage");
  const sidePanelBackdrop = document.getElementById("sidePanelBackdrop");
  const historyList = document.getElementById("historyList");

  const FEEDBACK_EMAILS = { alexis: "alexis.gorino@mindata.es", franco: "franco.velazco@mindata.es" };
  const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/";

  function getPublicSearchEndpoint() {
    return (document.querySelector('meta[name="radar-search-endpoint"]')?.content || "").trim();
  }

  function getPublicSearchHealthEndpoint() {
    const endpoint = getPublicSearchEndpoint();
    if (!endpoint) return "";
    const url = new URL(endpoint, window.location.href);
    url.pathname = url.pathname.endsWith("/api/search")
      ? url.pathname.replace(/\/api\/search$/, "/api/health")
      : `${url.pathname.replace(/\/$/, "")}/health`;
    return url.toString();
  }

  async function checkPublicSearchConnection() {
    const endpoint = getPublicSearchHealthEndpoint();
    if (!endpoint) return;
    checkProfilesConnectionBtn.disabled = true;
    checkProfilesConnectionBtn.textContent = "Comprobando…";
    publicSearchStatus.textContent = "Verificando el servicio y el cupo gratuito; esta comprobación no ejecuta búsquedas.";
    try {
      const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store" });
      const payload = await response.json();
      if (payload.ready) {
        publicSearchStatus.textContent = "Conexión correcta. El plan gratuito permite iniciar una búsqueda; esta comprobación no consumió consultas.";
        return;
      }
      const messages = {
        free_quota_exhausted: "El servicio responde, pero ya no quedan consultas gratuitas este mes. No se inició ninguna búsqueda.",
        hourly_quota_exhausted: "El servicio responde, pero se alcanzó el límite horario. Esperá a que se renueve; no se consumió una búsqueda.",
        free_plan_required: "El proveedor no informa un plan gratuito activo. RADAR no lanzará búsquedas que puedan generar cargos.",
        budget_unavailable: "No se pudo verificar la cuenta del proveedor. No se inició ninguna búsqueda ni se consumió una consulta.",
        rate_limited: "La red alcanzó el límite temporal de RADAR. Esperá un minuto y volvé a comprobar.",
        not_configured: "El Worker no tiene configurada la clave de SerpApi.",
        rate_limit_not_configured: "El Worker no tiene configurado el limitador de solicitudes.",
      };
      publicSearchStatus.textContent = messages[payload.error] || `No se pudo verificar la conexión (${response.status}). No se ejecutó una búsqueda.`;
    } catch {
      publicSearchStatus.textContent = "No se pudo conectar con el Worker. No se ejecutó una búsqueda ni se consumió una consulta.";
    } finally {
      checkProfilesConnectionBtn.disabled = false;
      checkProfilesConnectionBtn.textContent = "Probar conexión sin buscar";
    }
  }

  // ---------------------------------------------------------------
  // Chips
  // ---------------------------------------------------------------
  function renderChips(field) {
    const wrap = document.getElementById("chips-" + field);
    wrap.innerHTML = "";
    state[field].forEach((term, i) => {
      const chip = document.createElement("div");
      chip.className = "chip";

      const span = document.createElement("span");
      span.textContent = term;

      if (["atributos", "imprescindibles", "deseables"].includes(field)) {
        const moveBtn = document.createElement("button");
        moveBtn.type = "button";
        const target = field === "atributos" ? "imprescindibles" : field === "deseables" ? "imprescindibles" : "atributos";
        moveBtn.textContent = field === "atributos" ? "!" : field === "imprescindibles" ? "↔" : "↗";
        moveBtn.className = "chip-priority";
        moveBtn.title = field === "atributos" ? "Marcar como imprescindible; se exigirá junto con los demás" : field === "imprescindibles" ? "Pasar a señal alternativa; alcanzará con una de las alternativas" : "Promover a imprescindible; se exigirá junto con los demás";
        moveBtn.setAttribute("aria-label", moveBtn.title + ": " + term);
        moveBtn.addEventListener("click", () => {
          state[field].splice(i, 1);
          if (!state[target].some((existing) => existing.toLowerCase() === term.toLowerCase())) state[target].push(term);
          renderChips(field);
          renderChips(target);
        });
        chip.appendChild(moveBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Quitar " + term);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state[field].splice(i, 1);
        if (field === "alcance") countrySelect.value = RadarCountries.detectCountry(state.alcance.join(" ")) || "";
        renderChips(field);
        if (field === "rol") renderSynonyms();
      });

      chip.appendChild(span);
      chip.appendChild(removeBtn);
      wrap.appendChild(chip);
    });
    renderNetworkRecommendations();
  }

  function renderAllChips() {
    FIELDS.forEach(renderChips);
    renderSynonyms();
  }

  // ---------------------------------------------------------------
  // Role synonyms suggestions
  // ---------------------------------------------------------------
  function renderSynonyms() {
    const rolText = state.rol.join(" ");
    const synonyms = RadarKeywords.getSynonyms(rolText).filter(
      (s) => !state.rol.some((r) => r.toLowerCase() === s.toLowerCase())
    );
    synonymsList.innerHTML = "";
    if (!synonyms.length) {
      synonymsRow.classList.add("hidden");
    } else {
      synonymsRow.classList.remove("hidden");
      synonyms.forEach((syn) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "synonym-pill";
        btn.textContent = "+ " + syn;
        btn.addEventListener("click", () => {
          addTerm("rol", syn);
        });
        synonymsList.appendChild(btn);
      });
    }

    aiRoleSuggestRow.classList.toggle("hidden", !RadarAI.getKey() || !rolText.trim());
    aiSuggestHint.textContent = "";
    aiAtributosRow.classList.add("hidden");
    aiAtributosList.innerHTML = "";
  }

  // ---------------------------------------------------------------
  // AI suggestions (opt-in, ver aiPanel más abajo)
  // ---------------------------------------------------------------
  function renderAiPill(list, field, term) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "synonym-pill";
    btn.textContent = "+ " + term;
    btn.addEventListener("click", () => addTerm(field, term));
    list.appendChild(btn);
  }

  aiSuggestBtn.addEventListener("click", () => {
    const rolText = state.rol.join(" ");
    aiSuggestBtn.disabled = true;
    aiSuggestHint.classList.remove("hint-error");
    aiSuggestHint.textContent = "Pensando…";
    aiAtributosRow.classList.add("hidden");
    aiAtributosList.innerHTML = "";

    RadarAI.suggestTerms(rolText, jdInput.value)
      .then((suggestions) => {
        const roles = suggestions.roles.filter(
          (s) => !state.rol.some((r) => r.toLowerCase() === s.toLowerCase())
        );
        const atributos = suggestions.atributos.filter(
          (s) => !state.atributos.some((a) => a.toLowerCase() === s.toLowerCase())
        );
        roles.forEach((term) => renderAiPill(synonymsList, "rol", term));
        if (atributos.length) {
          aiAtributosRow.classList.remove("hidden");
          atributos.forEach((term) => renderAiPill(aiAtributosList, "atributos", term));
        }
        aiSuggestHint.textContent = roles.length || atributos.length ? "" : "Gemini no sumó nada nuevo para este rol.";
      })
      .catch((err) => {
        aiSuggestHint.classList.add("hint-error");
        aiSuggestHint.textContent = err.message;
      })
      .finally(() => {
        aiSuggestBtn.disabled = false;
      });
  });

  function addTerm(field, rawValue) {
    const value = rawValue.trim().replace(/,$/, "");
    if (!value) return;
    if (state[field].some((t) => t.toLowerCase() === value.toLowerCase())) return;
    const priorityBuckets = ["atributos", "imprescindibles", "deseables"];
    if (priorityBuckets.includes(field) && priorityBuckets.some((bucket) => bucket !== field && state[bucket].some((term) => term.toLowerCase() === value.toLowerCase()))) return;
    const canonicalCountry = field === "alcance" ? RadarCountries.countryList().find((country) => country.toLowerCase() === value.toLowerCase()) : null;
    if (canonicalCountry) {
      const previousCountry = state.alcance.find((term) => RadarCountries.countryList().some((country) => country.toLowerCase() === term.toLowerCase()));
      const localities = !previousCountry || previousCountry.toLowerCase() === canonicalCountry.toLowerCase()
        ? state.alcance.filter((term) => !RadarCountries.countryList().some((country) => country.toLowerCase() === term.toLowerCase()))
        : [];
      state.alcance = [canonicalCountry, ...localities];
      countrySelect.value = canonicalCountry;
    } else {
      state[field].push(value);
    }
    if (field === "alcance") noLocationCheckbox.checked = false;
    renderChips(field);
    if (field === "rol") renderSynonyms();
  }

  document.querySelectorAll(".field-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTerm(input.dataset.field, input.value);
        input.value = "";
      }
    });
  });

  // ---------------------------------------------------------------
  // Country select
  // ---------------------------------------------------------------
  function buildCountryOptions() {
    const groups = [
      ["Latinoamérica", RadarCountries.LATAM],
      ["Europa", RadarCountries.EUROPE],
      ["Otros", RadarCountries.OTHER],
    ];
    groups.forEach(([label, data]) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = label;
      Object.keys(data).forEach((country) => {
        const opt = document.createElement("option");
        opt.value = country;
        opt.textContent = country;
        optgroup.appendChild(opt);
      });
      countrySelect.appendChild(optgroup);
    });
  }
  buildCountryOptions();

  countrySelect.addEventListener("change", () => {
    if (countrySelect.value) {
      addTerm("alcance", countrySelect.value);
    }
  });
  noLocationCheckbox.addEventListener("change", () => {
    if (!noLocationCheckbox.checked) return;
    state.alcance = [];
    countrySelect.value = "";
    renderChips("alcance");
  });

  // ---------------------------------------------------------------
  // Network tabs
  // ---------------------------------------------------------------
  function renderNetworkRecommendations() {
    const container = document.getElementById("networkRecommendations");
    container.textContent = "";
    if (!state.rol.length && !state.atributos.length && !state.imprescindibles.length && !state.deseables.length) return;
    RadarNetworks.recommendNetworks(state).forEach((suggestion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "network-recommendation";
      const title = document.createElement("strong");
      title.textContent = RadarNetworks.NETWORKS[suggestion.id].label;
      button.append(title, document.createTextNode(suggestion.reason));
      button.addEventListener("click", () => selectNetwork(suggestion.id));
      container.appendChild(button);
    });
  }

  function renderNetworkTabs() {
    networkTabsEl.innerHTML = "";
    RadarNetworks.NETWORK_ORDER.forEach((id) => {
      const net = RadarNetworks.NETWORKS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "network-tab" + (id === selectedNetwork ? " active" : "");
      btn.textContent = net.label;
      btn.addEventListener("click", () => selectNetwork(id));
      networkTabsEl.appendChild(btn);
    });
  }

  function selectNetwork(id) {
    selectedNetwork = id;
    renderNetworkTabs();
    networkDescriptionEl.textContent = NETWORK_DESCRIPTIONS[id] || "";
    customSiteRow.classList.toggle("hidden", id !== "custom");
    githubModeRow.classList.toggle("hidden", id !== "github");
  }
  renderNetworkTabs();
  networkDescriptionEl.textContent = NETWORK_DESCRIPTIONS[selectedNetwork] || "";

  document.querySelectorAll('input[name="ghmode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      starsInputWrap.classList.toggle("hidden", document.querySelector('input[name="ghmode"]:checked').value !== "repos");
    });
  });

  // ---------------------------------------------------------------
  // JD analysis
  // ---------------------------------------------------------------
  function renderReviewItems(items, evidence, fieldName, result, promotable) {
    const list = document.createElement("ul");
    list.className = "jd-review-list";
    if (!items || !items.length) {
      const empty = document.createElement("li");
      empty.className = "jd-review-empty";
      empty.textContent = "No detectado";
      list.appendChild(empty);
    }
    (items || []).forEach((term) => {
      const item = document.createElement("li");
      const value = document.createElement("button");
      if (fieldName) {
        value.type = "button";
        value.className = "jd-review-term";
        value.textContent = promotable ? "+ Pasar a señales alternativas: " + term : fieldName === "atributos" ? "! Marcar imprescindible: " + term : fieldName === "imprescindibles" ? "↔ Pasar a alternativa: " + term : "× Quitar: " + term;
        value.title = promotable ? "Incluir este deseable en la ruta equilibrada, no en la específica" : fieldName === "atributos" ? "Exigir esta señal junto con los demás imprescindibles" : fieldName === "imprescindibles" ? "Dejar de exigir esta señal; cualquiera de las alternativas podrá coincidir" : "Quitar este término de los filtros";
        value.addEventListener("click", () => {
          if (promotable) {
            result.atributos = [...(result.atributos || []), term];
            result.atributosDeseables = (result.atributosDeseables || []).filter((entry) => entry !== term);
          } else if (fieldName === "atributos") {
            result.imprescindibles = [...(result.imprescindibles || []), term];
            result.atributos = (result.atributos || []).filter((entry) => entry !== term);
          } else if (fieldName === "imprescindibles") {
            result.atributos = [...(result.atributos || []), term];
            result.imprescindibles = (result.imprescindibles || []).filter((entry) => entry !== term);
          } else {
            result[fieldName] = (result[fieldName] || []).filter((entry) => entry !== term);
          }
          if (["atributos", "imprescindibles", "atributosDeseables"].includes(fieldName)) RadarReview.accept(result, "requirements");
          if (fieldName === "alcance") RadarReview.accept(result, "location");
          pendingAnalysis = result;
          renderJdReview(result);
        });
        item.appendChild(value);
      } else {
        const text = document.createElement("strong");
        text.textContent = term;
        item.appendChild(text);
      }
      const source = Array.isArray(evidence) ? evidence.find((entry) => entry.term.toLowerCase() === term.toLowerCase()) : null;
      const excerpt = source ? source.text : "";
      if (excerpt) {
        const quote = document.createElement("small");
        quote.textContent = "“" + excerpt + "”";
        item.appendChild(quote);
      }
      list.appendChild(item);
    });
    if (fieldName && !promotable) {
      const addRow = document.createElement("li");
      addRow.className = "jd-review-add";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 60;
      input.placeholder = "Agregar término";
      input.setAttribute("aria-label", "Agregar término para " + fieldName);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "jd-review-add-button";
      add.textContent = "+";
      add.setAttribute("aria-label", "Agregar término");
      const commit = () => {
        const term = input.value.trim();
        if (!term || (result[fieldName] || []).some((entry) => entry.toLowerCase() === term.toLowerCase())) return;
        result[fieldName] = [...(result[fieldName] || []), term];
        if (fieldName === "atributos") RadarReview.accept(result, "requirements");
        if (fieldName === "alcance") {
          result.country = RadarCountries.detectCountry(result.alcance.join(" ")) || result.country;
          RadarReview.accept(result, "location");
        }
        pendingAnalysis = result;
        renderJdReview(result);
      };
      add.addEventListener("click", commit);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") commit(); });
      addRow.append(input, add);
      list.appendChild(addRow);
    }
    return list;
  }

  function reviewGaps(result) {
    return RadarReview.pendingQuestions(result);
  }

  function renderReviewQuestions(result) {
    const container = document.getElementById("jdReviewQuestions");
    container.textContent = "";
    const gaps = reviewGaps(result);
    const descriptions = {
      source: ["¿El texto leído coincide con la JD original?", "Detectamos caracteres dañados o señales de lectura incompleta. Compará el texto de arriba con el original antes de seguir."],
      intent: ["¿Es un brief de búsqueda escrito con tus palabras?", "No encontramos estructura suficiente para reconocer una JD. Si es una necesidad de contratación, completá cargo, señales del perfil y ubicación abajo."],
      role: result.rol.length
        ? [`¿Se trata de ${result.rol[0]}?`, "Confirmá el cargo, corregilo arriba o elegí una búsqueda por requisitos sin título."]
        : ["No encontramos un cargo confiable.", "Podés escribir el cargo arriba o buscar solo por requisitos."],
      requirements: result.atributos.length || (result.imprescindibles || []).length || (result.atributosDeseables || []).length
        ? ["¿Qué condiciones son realmente obligatorias?", "Por defecto, las señales detectadas son alternativas: alcanza con que el perfil coincida con una. Marcá como imprescindibles solo las que deben cumplirse todas; dejá las equivalentes en alternativas y lo opcional como deseable."]
        : ["¿Qué diferencia a este perfil?", "Agregá al menos una habilidad, tarea clave, certificación o experiencia concreta. Para buscar sin título hacen falta dos señales y un sector, o tres señales."],
      location: result.alcance.length
        ? [`¿La ubicación correcta es ${result.alcance[result.alcance.length - 1]}?`, "Confirmá el alcance exacto; también podés ampliarlo al país o buscar sin ubicación." ]
        : [result.fileCountrySuggestion ? `El archivo dice ${result.fileCountrySuggestion}; el texto de la JD no lo confirma.` : "La JD no indica ubicación.", "Agregá una ubicación arriba o confirmá que querés buscar sin ese filtro."],
    };
    gaps.forEach((gap) => {
      const row = document.createElement("div");
      row.className = "jd-review-question";
      const copy = document.createElement("p");
      const title = document.createElement("strong");
      title.textContent = descriptions[gap][0] + " ";
      copy.append(title, document.createTextNode(descriptions[gap][1]));
      row.appendChild(copy);
      if (gap === "role" && result.rol.length) {
        const confirmRole = document.createElement("button");
        confirmRole.type = "button";
        confirmRole.className = "jd-review-choice";
        confirmRole.textContent = "Sí, es este perfil";
        confirmRole.addEventListener("click", () => {
          RadarReview.accept(result, "role");
          renderJdReview(result);
        });
        row.appendChild(confirmRole);
      }
      if (gap === "source") {
        const confirmSource = document.createElement("button");
        confirmSource.type = "button";
        confirmSource.className = "jd-review-choice";
        confirmSource.textContent = "Revisé el texto extraído";
        confirmSource.addEventListener("click", () => {
          RadarReview.accept(result, "source");
          renderJdReview(result);
        });
        row.appendChild(confirmSource);
      }
      if (gap === "intent") {
        const confirmBrief = document.createElement("button");
        confirmBrief.type = "button";
        confirmBrief.className = "jd-review-choice";
        confirmBrief.textContent = "Sí, es un brief de búsqueda";
        confirmBrief.addEventListener("click", () => {
          result.isBrief = true;
          renderJdReview(result);
        });
        row.appendChild(confirmBrief);
      }
      if (gap === "requirements" && result.atributos.length) {
        const confirmRequirements = document.createElement("button");
        confirmRequirements.type = "button";
        confirmRequirements.className = "jd-review-choice";
        confirmRequirements.textContent = "Sí, usar estas señales";
        confirmRequirements.addEventListener("click", () => {
          RadarReview.accept(result, "requirements");
          renderJdReview(result);
        });
        row.appendChild(confirmRequirements);
      }
      if (gap === "location" && result.alcance.length) {
        const exact = document.createElement("button");
        exact.type = "button";
        exact.className = "jd-review-choice";
        exact.textContent = "Sí, limitar a esta ubicación";
        exact.addEventListener("click", () => {
          RadarReview.accept(result, "location");
          renderJdReview(result);
        });
        row.appendChild(exact);
        if (result.country && result.alcance.some((term) => term !== result.country)) {
          const country = document.createElement("button");
          country.type = "button";
          country.className = "jd-review-choice";
          country.textContent = `Ampliar a ${result.country}`;
          country.addEventListener("click", () => {
            result.alcance = [result.country];
            RadarReview.accept(result, "location");
            renderJdReview(result);
          });
          row.appendChild(country);
        }
      }
      if (gap === "location" && result.fileCountrySuggestion) {
        const useCountry = document.createElement("button");
        useCountry.type = "button";
        useCountry.className = "jd-review-choice";
        useCountry.textContent = `Confirmar ${result.fileCountrySuggestion}`;
        useCountry.addEventListener("click", () => {
          result.country = result.fileCountrySuggestion;
          result.alcance = [result.fileCountrySuggestion];
          RadarReview.accept(result, "location");
          if (result.quality && Array.isArray(result.quality.warnings)) {
            result.quality.warnings = result.quality.warnings.filter((warning) =>
              !warning.startsWith("No detectamos una ubicación") && !warning.startsWith("El nombre del archivo menciona")
            );
          }
          renderJdReview(result);
        });
        row.appendChild(useCountry);
      }
      if (gap !== "source" && gap !== "intent" && gap !== "requirements") {
        const proceed = document.createElement("button");
        proceed.type = "button";
        proceed.className = "jd-review-choice";
        proceed.textContent = { role: "Buscar sin título", location: "Buscar sin ubicación" }[gap];
        proceed.addEventListener("click", () => {
          if (gap === "role") result.rol = [];
          if (gap === "location") {
            result.alcance = [];
            result.country = null;
          }
          RadarReview.accept(result, gap);
          renderJdReview(result);
        });
        row.appendChild(proceed);
      }
      container.appendChild(row);
    });
    const apply = document.getElementById("applyJdBtn");
    apply.disabled = !RadarReview.canApply(result);
    if (result.quality && result.quality.blocked) {
      const message = document.createElement("p");
      message.className = "jd-review-warning";
      message.textContent = "El archivo no es legible para una búsqueda fiable. Pegá una versión en texto o subí otro PDF.";
      container.appendChild(message);
    }
    const issue = result.isResume || (result.quality && result.quality.blocked) ? "" : RadarReview.profileIssue(result);
    if (issue) {
      const message = document.createElement("p");
      message.className = "jd-review-warning";
      message.textContent = issue;
      container.appendChild(message);
    }
  }

  function updateReviewBadge(result) {
    const level = result.quality ? result.quality.level : "Revisar";
    const ready = RadarReview.canApply(result);
    jdReviewBadge.textContent = ready ? "Listo para aplicar" : level;
    jdReviewBadge.className = "jd-review-badge" + (ready || level === "Buena señal" ? " is-good" : " is-warn");
  }

  function renderJdReview(result) {
    pendingAnalysis = result;
    const quality = result.quality || { level: "Revisar", warnings: [], evidence: {} };
    updateReviewBadge(result);
    jdReviewSummary.textContent = result.isResume
      ? "El documento parece un CV. No lo vamos a aplicar a los campos de búsqueda."
      : result.isJobPosting || result.isBrief
        ? `Detectamos ${quality.wordCount || 0} palabras. Revisá título, requisitos y ubicación antes de continuar.`
        : "No pudimos confirmar que el texto sea una descripción de puesto. Si lo escribiste con tus palabras, completá el relevamiento de abajo.";

    jdReviewGrid.textContent = "";
    const fields = [
      ["Rol", result.rol, result.rol[0] && quality.evidence && quality.evidence.rol ? [{ term: result.rol[0], text: quality.evidence.rol }] : []],
      ["Imprescindibles · se exigen todos (AND)", result.imprescindibles || [], quality.evidence && (quality.evidence.imprescindibles || quality.evidence.atributos), "imprescindibles"],
      ["Señales alternativas · alcanza con una (OR)", result.atributos, quality.evidence && quality.evidence.atributos, "atributos"],
      ["Deseables · solo ruta equilibrada", result.atributosDeseables || result.preferredAttributes, quality.evidence && (quality.evidence.atributosDeseables || quality.evidence.preferredAttributes), "atributosDeseables", true],
      ["Dominio", result.dominio, quality.evidence && quality.evidence.dominio, "dominio"],
      ["Ubicación", result.alcance, quality.evidence && quality.evidence.alcance, "alcance"],
      ["Contexto (no filtra la búsqueda)", [...(result.seniority || []), ...(result.modality || [])], []],
    ];
    fields.forEach(([label, terms, evidence, fieldName, promotable]) => {
      const card = document.createElement("div");
      card.className = "jd-review-field";
      const heading = document.createElement("h4");
      heading.textContent = label;
      card.appendChild(heading);
      if (label === "Rol") {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "jd-review-role-input";
        input.maxLength = 80;
        input.value = (terms || [])[0] || "";
        input.placeholder = "Título de perfil; puede quedar vacío si buscás por skills";
        input.setAttribute("aria-label", "Revisar título del puesto");
        input.addEventListener("input", () => {
          const alternatives = result.rol.slice(1);
          result.rol = input.value.trim() ? [input.value.trim(), ...alternatives] : alternatives;
          RadarReview.accept(result, "role");
          pendingAnalysis = result;
          renderReviewQuestions(result);
          updateReviewBadge(result);
        });
        card.appendChild(input);
        const excerpt = evidence && evidence[0] && evidence[0].text;
        if (excerpt) {
          const quote = document.createElement("small");
          quote.className = "jd-review-source";
          quote.textContent = "Evidencia: “" + excerpt + "”";
          card.appendChild(quote);
        }
      } else {
        if (fieldName === "alcance" && result.country) {
          const countryLabel = document.createElement("small");
          countryLabel.className = "jd-review-source";
          countryLabel.textContent = "País reconocido: " + result.country;
          card.appendChild(countryLabel);
        }
        card.appendChild(renderReviewItems(terms, evidence, fieldName, result, promotable));
      }
      jdReviewGrid.appendChild(card);
    });
    if (Array.isArray(result.roleAlternatives) && result.roleAlternatives.length) {
      const alternativesCard = document.createElement("div");
      alternativesCard.className = "jd-review-field jd-review-alternatives";
      const heading = document.createElement("h4");
      heading.textContent = "Títulos equivalentes sugeridos · elegí los pertinentes";
      alternativesCard.appendChild(heading);
      const choices = document.createElement("div");
      choices.className = "jd-review-choices";
      result.roleAlternatives.forEach((term) => {
        const button = document.createElement("button");
        const selected = result.rol.some((role) => role.toLowerCase() === term.toLowerCase());
        button.type = "button";
        button.className = "jd-review-choice" + (selected ? " is-selected" : "");
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.textContent = (selected ? "✓ " : "+ ") + term;
        button.addEventListener("click", () => {
          if (selected) result.rol = result.rol.filter((role) => role.toLowerCase() !== term.toLowerCase());
          else if (result.rol.length < RadarGenerator.MAX_TERMS_PER_GROUP) result.rol.push(term);
          renderJdReview(result);
        });
        choices.appendChild(button);
      });
      alternativesCard.appendChild(choices);
      jdReviewGrid.appendChild(alternativesCard);
    }

    const warnings = (quality.warnings || []).filter((warning) =>
      !((result.atributos.length || (result.imprescindibles || []).length) && warning.startsWith("No detectamos requisitos")) &&
      !(result.alcance.length && warning.startsWith("No detectamos una ubicación")) &&
      !(result.reviewAccepted && result.reviewAccepted.location && warning.startsWith("No detectamos una ubicación")) &&
      !((result.rol.length || (result.reviewAccepted && result.reviewAccepted.role)) && warning.startsWith("No pudimos identificar el título"))
    );
    jdReviewWarning.textContent = warnings.join(" ");
    jdReviewWarning.classList.toggle("hidden", warnings.length === 0 && (result.isJobPosting || result.isBrief));
    if (!result.isJobPosting && !result.isResume && warnings.length === 0) {
      jdReviewWarning.textContent = "Faltan señales suficientes para reconocer una vacante. No apliques estos campos sin revisarlos.";
      jdReviewWarning.classList.remove("hidden");
    }
    renderReviewQuestions(result);
    aiAnalyzeJdBtn.classList.toggle("hidden", !RadarAI.getKey() || result.isResume);
    jdReviewAiNote.classList.toggle("hidden", aiAnalyzeJdBtn.classList.contains("hidden"));
    jdReviewAiStatus.textContent = "";
    jdReview.classList.remove("hidden");
  }

  function applyPendingAnalysis() {
    if (!RadarReview.canApply(pendingAnalysis)) return;
    FIELDS.forEach((field) => {
      const sourceField = field === "deseables" ? "atributosDeseables" : field;
      state[field] = (pendingAnalysis[sourceField] || []).slice();
    });
    state.seniority = (pendingAnalysis.seniority || []).slice();
    renderAllChips();
    countrySelect.value = pendingAnalysis.country || RadarCountries.detectCountry(pendingAnalysis.alcance.join(" ")) || "";
    noLocationCheckbox.checked = !pendingAnalysis.alcance.length;
    renderRefinarSuggestions(pendingAnalysis.refinarSuggestion || []);
    resultsEl.classList.remove("show");
    jdReview.classList.add("hidden");
    pendingAnalysis = null;
    jdNeedsReview = false;
    document.getElementById("chips-rol").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function runAnalysis(fileName, sourceMeta) {
    const text = jdInput.value;
    if (!text.trim()) {
      showError("Pegá o subí una JD antes de analizar.", "file");
      return;
    }
    jdNeedsReview = true;
    const result = RadarExtractor.analyzeJD(text, {
      fileName: typeof fileName === "string" ? fileName : currentFileName,
      sourceMeta: sourceMeta === undefined ? currentSourceMeta : sourceMeta,
    });
    renderJdReview(result);
  }
  jdInput.addEventListener("input", () => {
    currentFileName = "";
    currentSourceMeta = null;
    uploadSequence++;
    fileInput.value = "";
    pendingAnalysis = null;
    jdNeedsReview = !!jdInput.value.trim();
    jdReview.classList.add("hidden");
    resultsEl.classList.remove("show");
  });
  document.getElementById("analyzeBtn").addEventListener("click", () => runAnalysis());
  document.getElementById("applyJdBtn").addEventListener("click", applyPendingAnalysis);
  document.getElementById("dismissJdBtn").addEventListener("click", () => jdReview.classList.add("hidden"));
  aiAnalyzeJdBtn.addEventListener("click", async () => {
    if (!pendingAnalysis || !jdInput.value.trim()) return;
    const sourceText = jdInput.value;
    aiAnalyzeJdBtn.disabled = true;
    jdReviewAiStatus.classList.remove("hint-error");
    jdReviewAiStatus.textContent = "Analizando la JD con Gemini…";
    try {
      const aiResult = await RadarAI.analyzeJD(sourceText);
      if (jdInput.value !== sourceText) {
        jdReviewAiStatus.textContent = "La JD cambió durante el análisis. Volvé a analizar el texto actualizado.";
        return;
      }
      if (!aiResult.isJobPosting) {
        jdReviewAiStatus.classList.add("hint-error");
        jdReviewAiStatus.textContent = "Gemini tampoco pudo confirmar con evidencia que sea una vacante. Revisá el texto o completá los campos manualmente.";
        return;
      }
      aiResult.quality = {
        level: "Analizado con Gemini · revisá antes de usar",
        wordCount: (jdInput.value.match(/[\p{L}\p{N}]+/gu) || []).length,
        warnings: (aiResult.quality && aiResult.quality.warnings) || [],
        evidence: (aiResult.quality && aiResult.quality.evidence) || {},
      };
      aiResult.fileCountrySuggestion = !aiResult.country && currentFileName ? RadarCountries.detectCountry(currentFileName) : null;
      pendingAnalysis = aiResult;
      renderJdReview(aiResult);
      jdReviewAiStatus.textContent = "Análisis actualizado. Verificá cada dato antes de aplicarlo.";
    } catch (err) {
      jdReviewAiStatus.classList.add("hint-error");
      jdReviewAiStatus.textContent = err.message || "No se pudo analizar la JD con Gemini.";
    } finally {
      aiAnalyzeJdBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // Refinar suggestions (seniority/modality the JD mentions) — shown as
  // clickable pills, never auto-added: excluding a term is a call the
  // recruiter makes, not something a keyword match should decide alone.
  // ---------------------------------------------------------------
  const refinarSuggestionsRow = document.getElementById("refinarSuggestionsRow");
  const refinarSuggestionsList = document.getElementById("refinarSuggestionsList");
  function renderRefinarSuggestions(suggestions) {
    const pending = suggestions.filter((s) => !state.refinar.some((r) => r.toLowerCase() === s.toLowerCase()));
    refinarSuggestionsList.innerHTML = "";
    if (!pending.length) {
      refinarSuggestionsRow.classList.add("hidden");
      return;
    }
    refinarSuggestionsRow.classList.remove("hidden");
    pending.forEach((term) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "synonym-pill";
      btn.textContent = "+ " + term;
      btn.addEventListener("click", () => {
        addTerm("refinar", term);
        renderRefinarSuggestions(suggestions);
      });
      refinarSuggestionsList.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------
  // File upload + drag & drop (.txt read directly, .pdf parsed with pdf.js
  // running fully client-side — the file never leaves the browser)
  // ---------------------------------------------------------------
  function extractPdfText(arrayBuffer) {
    return pdfjsLib.getDocument({ data: arrayBuffer }).promise.then((pdf) => {
      const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      return pageNumbers
        .reduce(
          (chain, pageNum) =>
            chain.then((pages) =>
              pdf
                .getPage(pageNum)
                .then((page) => page.getTextContent())
                .then((content) => [...pages, RadarPdfText.inspectPage(content.items, pageNum)])
            ),
          Promise.resolve([])
        ).then((pages) => ({
          text: pages.map((page) => page.text).join("\n"),
          sourceMeta: RadarPdfText.summarizePages(pages),
        }));
    });
  }

  function loadTextFile(file) {
    if (!file) return;
    const sequence = ++uploadSequence;
    currentFileName = file.name;
    currentSourceMeta = null;
    pendingAnalysis = null;
    jdNeedsReview = true;
    jdReview.classList.add("hidden");
    resultsEl.classList.remove("show");
    const isTxt = file.type === "text/plain" || /\.txt$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name);

    if (!isTxt && !isPdf && !isDocx) {
      showError("Se aceptan .txt, .pdf y .docx. Para .doc antiguo, imágenes u otros formatos, copiá y pegá el texto legible.", "file");
      return;
    }

    if (isTxt) {
      if (file.size > MAX_TXT_BYTES) {
        showError("El archivo pesa más de 500 KB. Pegá el texto directamente en el cuadro.", "file");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (sequence !== uploadSequence) return;
        jdInput.value = String(reader.result || "").slice(0, 20000);
        runAnalysis(file.name);
      };
      reader.onerror = () => { if (sequence === uploadSequence) showError("No se pudo leer el archivo.", "file"); };
      reader.readAsText(file);
      return;
    }

    if (isDocx) {
      if (file.size > MAX_DOCX_BYTES) {
        showError("El Word pesa más de 8 MB. Copiá y pegá el texto directamente en el cuadro.", "file");
        return;
      }
      if (typeof mammoth === "undefined") {
        showError("No se pudo cargar el lector de Word. Copiá y pegá el texto directamente.", "file");
        return;
      }
      showError("Leyendo el Word…", "file");
      const reader = new FileReader();
      reader.onload = () => {
        if (sequence !== uploadSequence) return;
        mammoth.extractRawText({ arrayBuffer: reader.result })
          .then((result) => {
            if (sequence !== uploadSequence) return;
            const trimmed = String(result.value || "").trim();
            if (!trimmed) {
              showError("El Word no contiene texto legible. Pegá una versión en texto.", "file");
              return;
            }
            jdInput.value = trimmed.slice(0, 20000);
            currentSourceMeta = { docxWarnings: (result.messages || []).filter((message) => message.type === "warning" || message.type === "error").map((message) => message.message) };
            showError("", "file");
            runAnalysis(file.name, currentSourceMeta);
          })
          .catch(() => { if (sequence === uploadSequence) showError("No se pudo leer ese Word. Puede estar dañado o protegido.", "file"); });
      };
      reader.onerror = () => { if (sequence === uploadSequence) showError("No se pudo leer el archivo de Word.", "file"); };
      reader.readAsArrayBuffer(file);
      return;
    }

    // isPdf
    if (file.size > MAX_PDF_BYTES) {
      showError("El PDF pesa más de 8 MB. Copiá y pegá el texto directamente en el cuadro.", "file");
      return;
    }
    if (typeof pdfjsLib === "undefined") {
      showError("No se pudo cargar el lector de PDF. Copiá y pegá el texto directamente.", "file");
      return;
    }
    showError("Leyendo el PDF…", "file");
    const reader = new FileReader();
    reader.onload = () => {
      if (sequence !== uploadSequence) return;
      extractPdfText(reader.result)
        .then(({ text, sourceMeta }) => {
          if (sequence !== uploadSequence) return;
          const trimmed = text.trim();
          if (!trimmed) {
            showError("No se pudo extraer texto de ese PDF (¿es un escaneo/imagen?). Pegalo a mano.", "file");
            return;
          }
          jdInput.value = trimmed.slice(0, 20000);
          currentSourceMeta = sourceMeta;
          showError("", "file");
          runAnalysis(file.name, sourceMeta);
        })
        .catch(() => { if (sequence === uploadSequence) showError("No se pudo leer ese PDF. Puede estar dañado o protegido.", "file"); });
    };
    reader.onerror = () => { if (sequence === uploadSequence) showError("No se pudo leer el archivo.", "file"); };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener("change", (e) => loadTextFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    loadTextFile(file);
  });

  // ---------------------------------------------------------------
  // Inline error messaging (no blocking alert())
  // ---------------------------------------------------------------
  const errorSlots = {};
  function errorAnchor(kind) {
    return kind === "file" ? document.querySelector(".row-actions") : document.getElementById("generateBtn");
  }
  function showError(msg, kind) {
    const key = kind === "file" ? "file" : "generate";
    if (!errorSlots[key]) {
      const el = document.createElement("div");
      el.className = "inline-error";
      errorAnchor(key).insertAdjacentElement("afterend", el);
      errorSlots[key] = el;
    }
    errorSlots[key].textContent = msg;
    setTimeout(() => {
      if (errorSlots[key]) errorSlots[key].textContent = "";
    }, 4000);
  }

  // ---------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------
  const relaxedModeCheckbox = document.getElementById("relaxedModeCheckbox");
  const outcomeStatus = document.getElementById("outcomeStatus");
  const strategyNote = document.getElementById("strategyNote");

  function renderOutcomeSummary() {
    const outcomes = RadarOutcome.read(localStorage);
    const counts = outcomes[selectedNetwork];
    if (!counts || RadarOutcome.total(counts) === 0) {
      outcomeStatus.textContent = "";
      return;
    }
    const networkName = RadarNetworks.NETWORKS[selectedNetwork].label;
    outcomeStatus.textContent = `Registrado en este navegador para ${networkName}: ${counts.relevant} útiles · ${counts.noisy} con ruido · ${counts.empty} sin perfiles.`;
  }

  // Renders the universal boolean + whatever the selected network needs.
  // Split out from the button handler so the "Ampliar búsqueda" checkbox
  // can re-render live without re-adding a history entry every toggle.
  function renderResults() {
    const relaxed = relaxedModeCheckbox.checked;
    document.querySelectorAll("[data-outcome]").forEach((button) => {
      button.disabled = false;
      button.setAttribute("aria-pressed", "false");
    });
    outcomeStatus.textContent = "";
    const universal = RadarGenerator.buildUniversalBoolean(state, relaxed);
    document.getElementById("out-universal").textContent = universal;
    const requiredCount = state.imprescindibles.length;
    const alternativeCount = state.atributos.length;
    const requiredSummary = requiredCount ? `${requiredCount} imprescindible${requiredCount === 1 ? "" : "s"} (se exigen todas)` : "sin imprescindibles marcados";
    const alternativeSummary = alternativeCount ? `${alternativeCount} alternativa${alternativeCount === 1 ? "" : "s"} (alcanza una)` : "sin alternativas";
    const optionalSummary = state.deseables.length
      ? relaxed ? "los deseables entran como alternativas" : "los deseables quedan fuera de esta consulta específica"
      : "sin deseables";
    const locationSummary = state.alcance.length ? `ubicación: ${state.alcance[state.alcance.length - 1]}` : "sin restricción geográfica";
    const roleSummary = state.rol.length ? `cargo: ${state.rol.join(" / ")}` : "sin título, por señales";
    strategyNote.textContent = `Esta ruta busca ${roleSummary}; combina ${requiredSummary}, ${alternativeSummary}; ${optionalSummary}; ${relaxed ? "sin filtro de sector" : state.dominio.length ? "con filtro de sector" : "sin filtro de sector indicado"}; ${locationSummary}.`;
    const truncated = RadarGenerator.getTruncatedFields(state);
    const friendlyField = { rol: "Rol", imprescindibles: "Imprescindibles", atributos: "Alternativas", deseables: "Deseables", dominio: "Dominio", alcance: "Alcance" };
    generatorWarning.textContent = truncated.length
      ? "Esta red admite hasta 6 términos por grupo. Se recortaron términos de: " + truncated.map((field) => friendlyField[field] || field).join(", ") + ". Quitá los menos importantes para evitar cortes invisibles."
      : "";
    generatorWarning.classList.toggle("hidden", truncated.length === 0);

    const net = RadarNetworks.NETWORKS[selectedNetwork];

    resultLinkedinNative.classList.toggle("hidden", selectedNetwork !== "linkedin");
    if (selectedNetwork === "linkedin") {
      const tiers = RadarGenerator.buildLinkedinBooleanTiers(state);
      const roleless = tiers.find((tier) => tier.label.includes("sin título"));
      const visibleTiers = tiers.slice(0, 2);
      if (tiers.length > 2) {
        const third = roleless && !visibleTiers.includes(roleless) ? roleless : tiers.find((tier) => !visibleTiers.includes(tier));
        if (third) visibleTiers.push(third);
      }
      document.getElementById("out-linkedin").textContent = visibleTiers[0] ? visibleTiers[0].query : "—";
      const tiersWrap = document.getElementById("linkedinTiers");
      tiersWrap.innerHTML = "";
      visibleTiers.forEach((tier, i) => {
        const a = document.createElement("a");
        a.className = "btn btn-engine linkedin-route" + (i === 0 ? " btn-engine-primary" : "");
        a.href = RadarGenerator.linkedinSearchUrl(tier.query);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        const hasRole = state.rol.length > 0;
        const isRoleless = tier.label.includes("sin título");
        const name = isRoleless ? "Sin título" : tier.label.includes("Específica") ? "Específica" : tier.label.includes("Equilibrada") ? "Equilibrada" : "Amplia";
        title.textContent = `${i + 1} · ${name}`;
        detail.textContent = isRoleless
          ? "Sin exigir cargo; mantiene imprescindibles y ubicación"
          : tier.label.includes("Específica")
            ? "Exige cargo, filtros confirmados y ubicación"
            : tier.label.includes("Equilibrada")
              ? state.deseables.length ? "Mantiene imprescindibles e incluye 1 deseable como alternativa" : state.atributos.length ? "Mantiene imprescindibles y usa 1 señal alternativa" : "Mantiene cargo, imprescindibles y ubicación"
              : "Mantiene cargo, imprescindibles y ubicación";
        a.append(title, detail);
        a.setAttribute("aria-label", `Buscar en LinkedIn: ${title.textContent}. ${detail.textContent}`);
        tiersWrap.appendChild(a);
      });
    }

    if (net.mode === "native-github") {
      resultXray.classList.add("hidden");
      resultGithub.classList.remove("hidden");
      const mode = document.querySelector('input[name="ghmode"]:checked').value;
      const url =
        mode === "repos"
          ? RadarGenerator.buildGithubRepoUrl(state, minStarsInput.value ? parseInt(minStarsInput.value, 10) : null)
          : RadarGenerator.buildGithubPeopleUrl(state);
      document.getElementById("openGithub").href = url;
    } else {
      resultGithub.classList.add("hidden");
      resultXray.classList.remove("hidden");
      let xrayQuery, label;
      if (net.mode === "resumes") {
        xrayQuery = RadarGenerator.buildResumesQuery(state, relaxed);
        label = "Búsqueda — " + net.label;
        xrayTiersEl.textContent = "";
      } else {
        const siteDomain = selectedNetwork === "custom" ? customSiteInput.value.trim().replace(/^https?:\/\//, "") : net.site;
        const tiers = RadarGenerator.buildXRayTiers(state, siteDomain, relaxed, net.looseRol);
        xrayQuery = tiers[0] ? tiers[0].query : RadarGenerator.buildXRayQuery(state, siteDomain, relaxed, net.looseRol);
        xrayTiersEl.textContent = "";
        tiers.slice(1).forEach((tier) => {
          const link = document.createElement("a");
          link.className = "btn btn-engine";
          link.href = RadarGenerator.googleUrl(tier.query);
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Google · " + tier.label;
          xrayTiersEl.appendChild(link);
        });
        label = "X-Ray — " + net.label;
      }
      document.getElementById("out-xray").textContent = xrayQuery;
      document.getElementById("xrayNetworkLabel").textContent = label;
      document.getElementById("openGoogle").href = RadarGenerator.googleUrl(xrayQuery);
      document.getElementById("openBing").href = RadarGenerator.bingUrl(xrayQuery);
      document.getElementById("xrayNote").textContent = NOTES[selectedNetwork] || "";
    }

    resultsEl.classList.add("show");
    renderPublicSearchSources();
    renderOutcomeSummary();
    return universal;
  }

  function renderPublicSearchSources() {
    const recommended = RadarNetworks.recommendNetworks(state).map((entry) => entry.id);
    const allowed = Object.keys(RadarTalentDiscovery.SOURCES);
    publicSearchSources.replaceChildren();
    allowed.forEach((source) => {
      const label = document.createElement("label");
      label.className = "public-source-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "publicSearchSource";
      input.value = source;
      input.checked = recommended.includes(source);
      input.addEventListener("change", () => {
        const selected = [...publicSearchSources.querySelectorAll('input[name="publicSearchSource"]:checked')];
        const overLimit = selected.length > RadarTalentDiscovery.MAX_SOURCES;
        findProfilesBtn.disabled = !getPublicSearchEndpoint() || selected.length === 0 || overLimit;
        checkProfilesConnectionBtn.disabled = !getPublicSearchEndpoint();
        if (overLimit) {
          publicSearchStatus.textContent = `Elegí hasta ${RadarTalentDiscovery.MAX_SOURCES} fuentes por consulta para cuidar el cupo mensual.`;
        } else {
          publicSearchStatus.textContent = "";
        }
      });
      const text = document.createElement("span");
      text.textContent = RadarTalentDiscovery.SOURCES[source].label;
      const description = document.createElement("small");
      description.textContent = RadarTalentDiscovery.SOURCES[source].description;
      const copy = document.createElement("span");
      copy.className = "public-source-copy";
      copy.append(text, description);
      label.title = RadarTalentDiscovery.SOURCES[source].description;
      label.append(input, copy);
      publicSearchSources.appendChild(label);
    });
    const selectedCount = recommended.filter((source) => allowed.includes(source)).length;
    findProfilesBtn.disabled = !getPublicSearchEndpoint() || selectedCount === 0;
    checkProfilesConnectionBtn.disabled = !getPublicSearchEndpoint();
    if (getPublicSearchEndpoint()) {
      publicSearchConfigNote.textContent = "La búsqueda usa consultas resumidas y no envía la JD completa.";
    } else {
      publicSearchConfigNote.textContent = "Falta configurar el endpoint seguro; la clave del proveedor nunca va en el navegador.";
    }
    publicSearchStatus.textContent = "";
    publicSearchResults.replaceChildren();
    publicSearchRows = [];
    publicSearchRefine.classList.add("hidden");
  }

  function renderPublicProfileResults(rows, sourceErrors, locationContext) {
    publicSearchResults.replaceChildren();
    if (locationContext) {
      const geography = document.createElement("p");
      geography.className = "public-search-geography";
      geography.textContent = locationContext.mode === "provider_location" && locationContext.canonicalName
        ? `Contexto de búsqueda: ${locationContext.canonicalName}. La consulta también conserva la localidad; verificá la residencia en el perfil.`
        : `La localidad se mantiene en la consulta${locationContext.countryCode ? ` y Google se orienta a ${locationContext.countryCode}` : ""}. El proveedor no confirmó una localidad exacta; no se amplió automáticamente a otro país.`;
      publicSearchResults.appendChild(geography);
    }
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "public-search-empty";
      empty.textContent = sourceErrors && sourceErrors.length
        ? "Las fuentes que respondieron no devolvieron perfiles verificables; las fuentes con error quedan sin confirmar."
        : "No aparecieron perfiles públicos verificables con esta consulta. Probá una ruta más amplia, revisá las señales o cambiá las fuentes.";
      publicSearchResults.appendChild(empty);
    } else {
      const summary = document.createElement("div");
      summary.className = "public-search-results-heading";
      const resultCount = document.createElement("strong");
      resultCount.textContent = `${rows.length} perfiles encontrados`;
      const summaryNote = document.createElement("span");
      summaryNote.textContent = "Ordenados por señales públicas visibles; no es una evaluación de idoneidad.";
      summary.append(resultCount, summaryNote);
      publicSearchResults.appendChild(summary);
      const list = document.createElement("ol");
      list.className = "public-profile-list";
      rows.forEach((row, index) => {
        const item = document.createElement("li");
        item.className = "public-profile-card";
        const head = document.createElement("div");
        head.className = "public-profile-head";
        const rank = document.createElement("span");
        rank.className = "public-profile-rank";
        rank.textContent = String(index + 1).padStart(2, "0");
        const title = document.createElement("div");
        title.className = "public-profile-title";
        const name = document.createElement("strong");
        name.textContent = row.name || "Nombre no visible en el resultado";
        const headline = document.createElement("span");
        headline.textContent = row.title;
        title.append(name, headline);
        const score = document.createElement("span");
        score.className = "public-profile-score";
        const scoreValue = document.createElement("strong");
        scoreValue.textContent = `${row.score}/100`;
        const scoreLabel = document.createElement("small");
        scoreLabel.textContent = row.confidence;
        score.append(scoreValue, scoreLabel);
        const identity = document.createElement("div");
        identity.className = "public-profile-identity";
        identity.append(rank, title);
        head.append(identity, score);

        const meta = document.createElement("div");
        meta.className = "public-profile-meta";
        const source = document.createElement("span");
        source.className = "public-profile-source";
        source.textContent = row.sourceLabel;
        const location = document.createElement("span");
        location.className = row.specificLocationHit ? "public-profile-location is-confirmed" : "public-profile-location is-unverified";
        location.textContent = row.locationStatus;
        meta.append(source, location);

        const snippet = document.createElement("p");
        snippet.className = "public-profile-snippet";
        snippet.textContent = row.snippet || "La fuente no publicó un fragmento descriptivo para este resultado.";
        const details = document.createElement("details");
        details.className = "public-profile-details";
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "Ver señales y cobertura";
        const evidence = document.createElement("p");
        evidence.className = "public-profile-evidence";
        const signalText = row.visibleSignals.length ? `Señales visibles: ${row.visibleSignals.join(" · ")}. ` : "No se detectaron señales textuales suficientes. ";
        evidence.textContent = `${signalText}Cobertura del fragmento: ${row.scoreBreakdown.join(" · ")}.`;
        details.append(detailsSummary, evidence);
        const link = document.createElement("a");
        link.className = "public-profile-link";
        link.href = row.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Abrir perfil en la fuente ↗";
        item.append(head, meta, snippet, details, link);
        list.appendChild(item);
      });
      publicSearchResults.appendChild(list);
    }
    if (sourceErrors && sourceErrors.length) {
      const partial = document.createElement("p");
      partial.className = "public-search-partial";
      const failedLabels = sourceErrors.map((item) => RadarTalentDiscovery.SOURCES[item.source]?.label || item.source);
      partial.textContent = `No se pudo completar ${failedLabels.length === 1 ? "esta fuente" : "estas fuentes"}: ${failedLabels.join(", ")}. Revisá el detalle y podés reintentar solo las fuentes con error.`;
      publicSearchResults.appendChild(partial);

      const retrySources = [...new Set(sourceErrors.map((item) => item.source))]
        .filter((source) => RadarTalentDiscovery.SOURCES[source]);
      if (retrySources.length) {
        const retryButton = document.createElement("button");
        retryButton.className = "btn btn-ghost btn-small public-search-retry";
        retryButton.type = "button";
        retryButton.textContent = `Reintentar ${retrySources.map((source) => RadarTalentDiscovery.SOURCES[source].label).join(" + ")}`;
        retryButton.addEventListener("click", () => runPublicProfileSearch(publicSearchStrategy, retrySources));
        publicSearchResults.appendChild(retryButton);
      }
    }
  }

  function renderSourceDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics) || !diagnostics.length) return null;
    const section = document.createElement("section");
    section.className = "public-search-diagnostics";
    section.setAttribute("aria-label", "Resultado por fuente");
    const heading = document.createElement("strong");
    heading.textContent = "Qué pasó en cada fuente";
    const list = document.createElement("ul");
    const errorMessages = {
      provider_rate_limited: "El proveedor alcanzó su límite temporal.",
      provider_timeout: "El proveedor agotó el tiempo de espera.",
      provider_network_error: "No se pudo establecer conexión con el proveedor.",
      provider_credentials_rejected: "El proveedor rechazó su credencial; avisá al equipo administrador.",
      provider_location_rejected: "El proveedor rechazó el contexto geográfico.",
      provider_query_rejected: "El proveedor rechazó la consulta generada.",
      provider_request_rejected: "El proveedor rechazó la solicitud.",
      provider_unavailable: "El proveedor no está disponible ahora.",
      source_unavailable: "La fuente devolvió un error inesperado.",
    };
    diagnostics.forEach((item) => {
      const entry = document.createElement("li");
      const label = RadarTalentDiscovery.SOURCES[item.source]?.label || item.source;
      let detail = "No hubo diagnóstico disponible.";
      if (item.status === "error") detail = errorMessages[item.code] || "No se pudo completar la consulta.";
      else if (item.status === "profiles_found") detail = `${item.profileCount} perfiles públicos admitidos de ${item.organicCount} resultados indexados.`;
      else if (item.status === "no_public_profiles") detail = `El buscador devolvió ${item.organicCount} resultados, pero ninguno tenía una URL de perfil reconocible en esta fuente.`;
      else if (item.status === "no_indexed_results") detail = "El buscador no encontró páginas indexadas con estos términos.";
      entry.textContent = `${label}: ${detail}`;
      list.appendChild(entry);
    });
    section.append(heading, list);
    return section;
  }

  function renderPublicSearchError(error) {
    publicSearchResults.replaceChildren();
    const panel = document.createElement("section");
    panel.className = "public-search-error";
    panel.setAttribute("role", "alert");
    const heading = document.createElement("strong");
    heading.textContent = "No pudimos consultar las fuentes";
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : "La consulta no pudo completarse.";
    const note = document.createElement("span");
    note.textContent = "No mostramos una lista vacía como si la búsqueda hubiera terminado correctamente. No se hacen reintentos automáticos.";
    panel.append(heading, message, note);
    const diagnostics = renderSourceDiagnostics(error && error.sourceDiagnostics);
    if (diagnostics) panel.appendChild(diagnostics);
    const retrySources = [...new Set((error && error.sourceDiagnostics || [])
      .filter((item) => item && item.status === "error" && RadarTalentDiscovery.SOURCES[item.source])
      .map((item) => item.source))];
    if (retrySources.length) {
      const retryButton = document.createElement("button");
      retryButton.className = "btn btn-ghost btn-small public-search-retry";
      retryButton.type = "button";
      retryButton.textContent = `Reintentar ${retrySources.map((source) => RadarTalentDiscovery.SOURCES[source].label).join(" + ")}`;
      retryButton.addEventListener("click", () => runPublicProfileSearch(publicSearchStrategy, retrySources));
      panel.appendChild(retryButton);
    }
    publicSearchResults.appendChild(panel);
  }

  async function runPublicProfileSearch(strategy, sourceOverride) {
    const publicSearchEndpoint = getPublicSearchEndpoint();
    if (!publicSearchEndpoint) return;
    const selected = sourceOverride || [...publicSearchSources.querySelectorAll('input[name="publicSearchSource"]:checked')].map((input) => input.value);
    if (!selected.length || selected.length > RadarTalentDiscovery.MAX_SOURCES) {
      publicSearchStatus.textContent = `Elegí entre 1 y ${RadarTalentDiscovery.MAX_SOURCES} fuentes.`;
      return;
    }
    const sequence = ++publicSearchSequence;
    const plan = RadarTalentDiscovery.buildPlan(state, selected, RadarGenerator, { strategy });
    if (!plan.queries.length) {
      publicSearchStatus.textContent = "No se pudo formar una consulta válida. Quitá términos largos o reducí la cantidad de señales y volvé a intentar.";
      return;
    }
    findProfilesBtn.disabled = true;
    findProfilesBtn.textContent = "Buscando perfiles…";
    broadenPublicSearchBtn.disabled = true;
    publicSearchRefine.classList.add("hidden");
    if (strategy === "precise" && !sourceOverride) publicSearchRows = [];
    publicSearchStrategy = strategy;
    const skippedNote = plan.skippedSources.length
      ? ` Se omitieron por longitud: ${plan.skippedSources.map((source) => RadarTalentDiscovery.SOURCES[source].label).join(", ")}.`
      : "";
    publicSearchStatus.textContent = sourceOverride
      ? `Reintentando ${plan.queries.map((query) => query.label).join(", ")} con los mismos criterios. Consume una búsqueda por fuente del cupo mensual.`
      : `Consultando ${plan.queries.length} fuentes públicas. Esta ruta consume una búsqueda por fuente del cupo mensual; no se ejecutan intentos extra automáticamente.${skippedNote}`;
    publicSearchResults.replaceChildren();
    try {
      const response = await RadarTalentDiscovery.search(publicSearchEndpoint, plan, state);
      if (sequence !== publicSearchSequence) return;
      const rowsByUrl = new Map(publicSearchRows.map((row) => [row.url, row]));
      response.results.forEach((row) => {
        const previous = rowsByUrl.get(row.url);
        if (!previous || row.score > previous.score) rowsByUrl.set(row.url, row);
      });
      publicSearchRows = [...rowsByUrl.values()].sort((a, b) => b.score - a.score || (a.providerPosition || 999) - (b.providerPosition || 999)).slice(0, RadarTalentDiscovery.MAX_RESULTS);
      renderPublicProfileResults(publicSearchRows, response.sourceErrors, response.locationContext);
      const diagnostics = renderSourceDiagnostics(response.sourceDiagnostics);
      if (diagnostics) publicSearchResults.appendChild(diagnostics);
      const count = publicSearchResults.querySelectorAll(".public-profile-card").length;
      const partial = response.sourceErrors.length > 0;
      publicSearchStatus.textContent = count
        ? `${partial ? "Resultado parcial" : "Listo"}: ${count} perfiles públicos ordenados por evidencia visible. Confirmá ubicación y requisitos en cada fuente.`
        : partial
          ? "Respuesta parcial: algunas fuentes fallaron y las que respondieron no devolvieron perfiles verificables."
          : "Búsqueda completada sin perfiles verificables.";
      if (count <= 3 && strategy !== "market") {
        const nextStrategy = strategy === "precise" ? "equivalent" : "market";
        broadenPublicSearchBtn.dataset.strategy = nextStrategy;
        broadenPublicSearchBtn.textContent = nextStrategy === "equivalent" ? "Probar perfiles equivalentes" : "Ampliar sin cargo ni sector";
        publicSearchRefineTitle.textContent = count ? `Aparecieron ${count} perfiles. ¿Querés ampliar?` : "No aparecieron perfiles verificables con esta ruta.";
        const retryNote = partial
          ? " Hay fuentes con error; podés reintentarlas por separado sin volver a consultar las demás."
          : "";
        publicSearchRefineText.textContent = nextStrategy === "equivalent"
          ? `Siguiente intento: deja de exigir el título literal y busca perfiles por señales del puesto. Mantiene la localidad, los imprescindibles y las exclusiones. Consume una búsqueda adicional por fuente seleccionada.${retryNote}`
          : `Última ampliación: quita el cargo literal y el sector, y conserva la localidad, los imprescindibles y las exclusiones. Si sigue sin alcanzar, revisá si alguna señal marcada como imprescindible admite equivalencias o elegí otra fuente. Consume una búsqueda adicional por fuente seleccionada.${retryNote}`;
        publicSearchRefine.classList.remove("hidden");
      } else {
        publicSearchRefine.classList.add("hidden");
      }
    } catch (error) {
      if (sequence !== publicSearchSequence) return;
      publicSearchStatus.textContent = "La búsqueda no se completó.";
      publicSearchRefine.classList.add("hidden");
      renderPublicSearchError(error);
    } finally {
      if (sequence === publicSearchSequence) {
        findProfilesBtn.disabled = false;
        findProfilesBtn.textContent = "Buscar perfiles públicos";
        broadenPublicSearchBtn.disabled = false;
      }
    }
  }

  findProfilesBtn.addEventListener("click", () => runPublicProfileSearch("precise"));
  checkProfilesConnectionBtn.addEventListener("click", checkPublicSearchConnection);
  broadenPublicSearchBtn.addEventListener("click", () => runPublicProfileSearch(broadenPublicSearchBtn.dataset.strategy || "equivalent"));

  document.querySelectorAll("[data-outcome]").forEach((button) => {
    button.addEventListener("click", () => {
      const recorded = RadarOutcome.record(localStorage, selectedNetwork, button.dataset.outcome);
      outcomeStatus.textContent = recorded
        ? "Gracias. Se guardó únicamente el conteo local de esta fuente."
        : "No se pudo guardar en este navegador.";
      document.querySelectorAll("[data-outcome]").forEach((choice) => {
        choice.setAttribute("aria-pressed", choice === button ? "true" : "false");
        choice.disabled = true;
      });
      if (!recorded) return;
      setTimeout(renderOutcomeSummary, 1200);
    });
  });

  document.getElementById("generateBtn").addEventListener("click", () => {
    if (jdNeedsReview && jdInput.value.trim()) {
      showError("La JD o el brief cambió. Analizalo y aplicá el relevamiento, o borrá el texto para seguir con los campos manuales.");
      return;
    }
    if (selectedNetwork === "custom" && !customSiteInput.value.trim()) {
      showError("Indicá el dominio público donde querés buscar perfiles.");
      return;
    }
    const profileIssue = RadarReview.profileIssue(state);
    if (profileIssue) {
      showError(profileIssue);
      return;
    }
    if (!state.alcance.length && !noLocationCheckbox.checked) {
      showError("Indicá una ciudad, región o país; si no debe limitarse, marcá ‘Buscar sin restricción geográfica’.");
      return;
    }
    const universal = renderResults();
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    saveToHistory(universal);
    RadarTracking.logEvent("generar_booleano", { red: selectedNetwork });
  });

  relaxedModeCheckbox.addEventListener("change", () => {
    if (resultsEl.classList.contains("show")) renderResults();
  });

  // ---------------------------------------------------------------
  // Copy buttons
  // ---------------------------------------------------------------
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.copy;
      const text = document.getElementById(targetId).textContent;
      const original = btn.textContent;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.textContent = "Copiado";
        })
        .catch(() => {
          btn.textContent = "No se pudo copiar";
        })
        .finally(() => {
          setTimeout(() => {
            btn.textContent = original;
          }, 1400);
        });
    });
  });

  // ---------------------------------------------------------------
  // Clear all
  // ---------------------------------------------------------------
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    FIELDS.forEach((f) => {
      state[f] = [];
      renderChips(f);
    });
    state.seniority = [];
    jdInput.value = "";
    currentFileName = "";
    currentSourceMeta = null;
    uploadSequence++;
    fileInput.value = "";
    pendingAnalysis = null;
    jdNeedsReview = false;
    jdReview.classList.add("hidden");
    countrySelect.value = "";
    noLocationCheckbox.checked = false;
    customSiteInput.value = "";
    minStarsInput.value = "";
    relaxedModeCheckbox.checked = false;
    selectNetwork("linkedin");
    resultsEl.classList.remove("show");
    Object.values(errorSlots).forEach((el) => (el.textContent = ""));
    renderRefinarSuggestions([]);
    generatorWarning.classList.add("hidden");
  });

  // ---------------------------------------------------------------
  // History (localStorage only — never leaves the browser)
  // ---------------------------------------------------------------
  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeHistory(arr) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, MAX_HISTORY)));
    } catch (e) {
      // private browsing / storage quota — history just won't persist this session
    }
  }

  function saveToHistory(universalBoolean) {
    if (!universalBoolean) return;
    const entry = {
      ts: Date.now(),
      rol: state.rol.slice(),
      atributos: state.atributos.slice(),
      imprescindibles: state.imprescindibles.slice(),
      deseables: state.deseables.slice(),
      dominio: state.dominio.slice(),
      alcance: state.alcance.slice(),
      refinar: state.refinar.slice(),
      seniority: (state.seniority || []).slice(),
      network: selectedNetwork,
      universal: universalBoolean,
    };
    const history = readHistory();
    history.unshift(entry);
    writeHistory(history);
    renderHistory();
  }

  function formatHistoryDate(ts) {
    try {
      return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function renderHistory() {
    const history = readHistory();
    historyList.innerHTML = "";
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Todavía no armaste ningún booleano en este navegador.";
      historyList.appendChild(empty);
      return;
    }
    history.forEach((entry) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";

      const title = document.createElement("div");
      title.className = "history-item-title";
      title.textContent = (entry.rol && entry.rol[0]) || "(sin rol)";

      const meta = document.createElement("div");
      meta.className = "history-item-meta";
      meta.textContent = formatHistoryDate(entry.ts) + " · " + entry.network;

      const preview = document.createElement("div");
      preview.className = "history-item-preview";
      preview.textContent = entry.universal;

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(preview);
      item.addEventListener("click", () => restoreFromHistory(entry));
      historyList.appendChild(item);
    });
  }

  function restoreFromHistory(entry) {
    jdInput.value = "";
    fileInput.value = "";
    pendingAnalysis = null;
    jdNeedsReview = false;
    jdReview.classList.add("hidden");
    FIELDS.forEach((f) => {
      state[f] = (entry[f] || []).slice();
    });
    state.seniority = Array.isArray(entry.seniority) ? entry.seniority.slice() : [];
    renderAllChips();
    noLocationCheckbox.checked = !state.alcance.length;
    relaxedModeCheckbox.checked = false;
    if (entry.network && RadarNetworks.NETWORKS[entry.network]) {
      selectNetwork(entry.network);
    }
    closeSidePanels();
    document.getElementById("generateBtn").click();
  }

  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    writeHistory([]);
    renderHistory();
  });

  // ---------------------------------------------------------------
  // Side panels (history / help / feedback) — each is a modal dialog for
  // accessibility purposes: focus moves in on open, is trapped inside the
  // panel with Tab while it's open, and returns to whatever triggered it
  // on close, so a keyboard/screen-reader user never loses their place.
  // ---------------------------------------------------------------
  const ALL_SIDE_PANELS = [historyPanel, helpPanel, aiPanel, feedbackPanel, jdWarningPanel];
  let sidePanelOpenerEl = null;

  function focusableIn(panel) {
    return Array.from(panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
  }

  function closeSidePanels() {
    const wasOpen = ALL_SIDE_PANELS.some((p) => !p.classList.contains("hidden"));
    ALL_SIDE_PANELS.forEach((p) => p.classList.add("hidden"));
    sidePanelBackdrop.classList.add("hidden");
    if (wasOpen && sidePanelOpenerEl) {
      sidePanelOpenerEl.focus();
      sidePanelOpenerEl = null;
    }
  }

  function openSidePanel(panel, openerEl) {
    closeSidePanels();
    sidePanelOpenerEl = openerEl || document.activeElement;
    panel.classList.remove("hidden");
    sidePanelBackdrop.classList.remove("hidden");
    const focusables = focusableIn(panel);
    if (focusables.length) focusables[0].focus();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const openPanel = ALL_SIDE_PANELS.find((p) => !p.classList.contains("hidden"));
    if (!openPanel) return;
    const focusables = focusableIn(openPanel);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.getElementById("historyToggleBtn").addEventListener("click", (e) => {
    renderHistory();
    openSidePanel(historyPanel, e.currentTarget);
  });
  document.getElementById("helpBtn").addEventListener("click", (e) => openSidePanel(helpPanel, e.currentTarget));
  document.getElementById("feedbackBtn").addEventListener("click", (e) => openSidePanel(feedbackPanel, e.currentTarget));
  document.getElementById("closeHistoryBtn").addEventListener("click", closeSidePanels);
  document.getElementById("closeHelpBtn").addEventListener("click", closeSidePanels);
  document.getElementById("closeFeedbackBtn").addEventListener("click", closeSidePanels);
  document.getElementById("closeJdWarningBtn").addEventListener("click", closeSidePanels);
  document.getElementById("closeJdWarningBtnBottom").addEventListener("click", closeSidePanels);
  sidePanelBackdrop.addEventListener("click", closeSidePanels);

  // ---------------------------------------------------------------
  // AI settings panel
  // ---------------------------------------------------------------
  const aiKeyInput = document.getElementById("aiKeyInput");
  const aiKeyHint = document.getElementById("aiKeyHint");

  function refreshAiKeyHint() {
    const key = RadarAI.getKey();
    aiKeyHint.classList.remove("hint-error");
    aiKeyHint.textContent = key ? "Key guardada, termina en ****" + key.slice(-4) + "." : "Sin key guardada todavía.";
  }

  document.getElementById("aiSettingsBtn").addEventListener("click", (e) => {
    aiKeyInput.value = "";
    refreshAiKeyHint();
    openSidePanel(aiPanel, e.currentTarget);
  });
  document.getElementById("closeAiBtn").addEventListener("click", closeSidePanels);
  document.getElementById("saveAiKeyBtn").addEventListener("click", () => {
    const key = aiKeyInput.value.trim();
    if (!key) {
      aiKeyHint.classList.add("hint-error");
      aiKeyHint.textContent = "Pegá una key antes de guardar.";
      return;
    }
    RadarAI.setKey(key);
    aiKeyInput.value = "";
    refreshAiKeyHint();
    renderSynonyms();
  });
  document.getElementById("clearAiKeyBtn").addEventListener("click", () => {
    RadarAI.setKey("");
    aiKeyInput.value = "";
    refreshAiKeyHint();
    renderSynonyms();
  });

  function openJdWarning(message, openerEl) {
    jdWarningMessage.textContent = message;
    openSidePanel(jdWarningPanel, openerEl);
  }

  function feedbackTargets(to) {
    if (to === "ambos") return [FEEDBACK_EMAILS.alexis, FEEDBACK_EMAILS.franco];
    return [FEEDBACK_EMAILS[to]];
  }

  function sendFeedbackTo(email, subject, message) {
    return fetch(FEEDBACK_ENDPOINT + encodeURIComponent(email), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: subject,
        name: "Radar Tool",
        message: message,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error("bad status");
      return res;
    });
  }

  document.getElementById("sendFeedbackBtn").addEventListener("click", () => {
    const to = document.getElementById("feedbackTo").value;
    const type = document.getElementById("feedbackType").value;
    const text = document.getElementById("feedbackText").value.trim();
    const feedbackHint = document.getElementById("feedbackHint");
    const btn = document.getElementById("sendFeedbackBtn");

    // Honeypot: a hidden field a human never sees or fills. Any script that
    // blindly fills every input on the page will fill it too, so a non-empty
    // value here means "not a person" — bail out quietly, no error shown,
    // no request sent (showing an error would just teach the bot to leave
    // it blank).
    if (document.getElementById("feedbackWebsite").value.trim()) return;

    if (!text) {
      feedbackHint.classList.add("hint-error");
      feedbackHint.textContent = "Contá qué pasó antes de enviar.";
      return;
    }

    const subject = "Radar Tool - " + type;
    btn.disabled = true;
    feedbackHint.classList.remove("hint-error");
    feedbackHint.textContent = "Enviando…";

    const targets = feedbackTargets(to);
    Promise.all(targets.map((email) => sendFeedbackTo(email, subject, text)))
      .then(() => {
        feedbackHint.classList.remove("hint-error");
        feedbackHint.textContent = "Enviado. Gracias por avisar.";
        document.getElementById("feedbackText").value = "";
      })
      .catch(() => {
        feedbackHint.classList.add("hint-error");
        feedbackHint.textContent = "No se pudo enviar. Probá de nuevo en un rato.";
      })
      .finally(() => {
        btn.disabled = false;
      });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidePanels();
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("generateBtn").click();
    }
  });

  // ---------------------------------------------------------------
  // Footer year
  // ---------------------------------------------------------------
  const footerYearEl = document.getElementById("footerYear");
  if (footerYearEl) footerYearEl.textContent = String(new Date().getFullYear());

  renderAllChips();
})();
