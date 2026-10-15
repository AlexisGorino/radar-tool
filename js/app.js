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
    linkedin: "Perfiles profesionales. Confirmá la ubicación con el filtro de LinkedIn; los datos públicos pueden estar desactualizados.",
    github: "Útil para perfiles técnicos con actividad pública. No confirma empleo ni residencia.",
    stackoverflow: "Aporta señales de actividad técnica, no historial laboral.",
    xing: "Más usado en Alemania, Austria y Suiza. Confirmá país y ciudad en el perfil.",
    behance: "Portfolios públicos de diseño e ilustración. Revisá los trabajos en el sitio.",
    resumes: "CV indexados, posiblemente antiguos. Verificá la fuente y cuidá los datos personales.",
    custom: "Busca dentro de un sitio específico. Puede mostrar ofertas en vez de perfiles.",
  };

  const NOTES = {
    linkedin: "Google busca perfiles públicos que tiene indexados. Confirmá la ciudad en LinkedIn.",
    stackoverflow: "La actividad técnica es una señal; no confirma experiencia laboral.",
    xing: "Más cobertura en Alemania, Austria y Suiza. Confirmá residencia actual.",
    behance: "Revisá portfolio y especialidad dentro del sitio.",
    resumes: "Busca CV indexados; pueden estar desactualizados.",
    custom: "Verificá que cada resultado sea un perfil, no una oferta.",
  };

  const HISTORY_KEY = "radar-history-v1";
  const MAX_HISTORY = 20;

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  const jdInput = document.getElementById("jdInput");
  const descriptionModeBtn = document.getElementById("descriptionModeBtn");
  const ideaModeBtn = document.getElementById("ideaModeBtn");
  const intakeCaption = document.getElementById("intakeCaption");
  const intakeOptional = intakeCaption.querySelector("span");
  const intakeModeHint = document.getElementById("intakeModeHint");
  const experienceModeHint = document.getElementById("experienceModeHint");
  const experienceModeButtons = [...document.querySelectorAll("[data-experience-mode]")];
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const readinessProfile = document.getElementById("readinessProfile");
  const readinessLocation = document.getElementById("readinessLocation");
  const readinessJd = document.getElementById("readinessJd");
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
  const networkOptionsCard = document.getElementById("networkOptionsCard");
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
  let intakeMode = "description";
  let currentFileName = "";
  let currentSourceMeta = null;
  let uploadSequence = 0;
  let publicSearchSequence = 0;
  let publicSearchRows = [];
  let publicShareRows = new Map();
  const MAX_WHATSAPP_SHARE_PROFILES = 8;
  const MAX_SHARE_URL_LENGTH = 7000;
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

  function setIntakeMode(mode) {
    intakeMode = mode === "idea" ? "idea" : "description";
    const ideaMode = intakeMode === "idea";
    descriptionModeBtn.classList.toggle("is-active", !ideaMode);
    ideaModeBtn.classList.toggle("is-active", ideaMode);
    descriptionModeBtn.setAttribute("aria-pressed", String(!ideaMode));
    ideaModeBtn.setAttribute("aria-pressed", String(ideaMode));
    intakeCaption.firstChild.textContent = ideaMode ? "Contá a quién querés encontrar" : "Descripción del puesto ";
    intakeOptional.hidden = ideaMode;
    jdInput.setAttribute("aria-label", ideaMode ? "Idea de búsqueda escrita con tus palabras" : "Descripción del puesto");
    jdInput.placeholder = ideaMode
      ? "Ej.: Busco un perfil de desarrollo con experiencia en travel y manejo de Amadeus. No sé si es obligatorio."
      : "Ej.: Técnico/a de redes con experiencia en FTTH, para trabajar en Valencia, España...";
    intakeModeHint.textContent = ideaMode
      ? "Describilo con tus palabras."
      : "Pegala o adjuntá un archivo.";
  }

  function setExperienceMode(mode, persist = true) {
    const expertMode = mode === "expert";
    const appShell = document.getElementById("appShell");
    appShell.dataset.experienceMode = expertMode ? "expert" : "guided";
    experienceModeButtons.forEach((button) => {
      const selected = button.dataset.experienceMode === appShell.dataset.experienceMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    experienceModeHint.textContent = expertMode
      ? "Filtros directos · más opciones abajo."
      : "1. Describí · 2. Revisá · 3. Buscá";

    if (persist) {
      try {
        localStorage.setItem("radar-experience-mode-v1", appShell.dataset.experienceMode);
      } catch { /* La preferencia es opcional; el modo sigue funcionando sin almacenamiento. */ }
    }
  }

  const savedExperienceMode = (() => {
    try { return localStorage.getItem("radar-experience-mode-v1"); }
    catch { return null; }
  })();
  setExperienceMode(savedExperienceMode === "expert" ? "expert" : "guided", false);

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
    publicSearchStatus.textContent = "Revisando conexión y cupo. No consume búsquedas.";
    try {
      const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (payload.ready) {
        publicSearchStatus.textContent = payload.braveConfigured
          ? "Conexión lista; hay una clave de respaldo configurada. La prueba no consumió búsquedas."
          : "Conexión lista; la prueba no consumió búsquedas.";
        return;
      }
      const messages = {
        free_quota_exhausted: "Se agotó el cupo gratuito del mes. No se inició la búsqueda.",
        hourly_quota_exhausted: "Se alcanzó el límite por hora. Esperá y volvé a probar.",
        free_plan_required: "No hay un plan gratuito activo. RADAR no inició la búsqueda.",
        budget_unavailable: "No se pudo comprobar el cupo. No se inició la búsqueda.",
        rate_limited: "RADAR alcanzó el límite temporal. Probá en un minuto.",
        not_configured: "Falta configurar la clave del proveedor.",
        rate_limit_not_configured: "Falta configurar el límite de solicitudes.",
      };
      publicSearchStatus.textContent = messages[payload.error] || `No se pudo verificar la conexión (${response.status}). No se ejecutó una búsqueda.`;
    } catch {
      publicSearchStatus.textContent = "Sin conexión con el servicio. No se consumió una búsqueda.";
    } finally {
      checkProfilesConnectionBtn.disabled = false;
      checkProfilesConnectionBtn.textContent = "Probar conexión";
    }
  }

  // ---------------------------------------------------------------
  // Chips
  // ---------------------------------------------------------------
  function hideGeneratedResults() {
    resultsEl.classList.remove("show");
    networkOptionsCard.classList.add("hidden");
  }

  function setReadiness(item, stateName, status, detail) {
    item.dataset.state = stateName;
    item.querySelector(".readiness-status").textContent = status;
    item.querySelector(".readiness-detail").textContent = detail;
  }

  function updateSearchReadiness() {
    const profileIssue = RadarReview.profileIssue(state);
    if (profileIssue) {
      setReadiness(readinessProfile, "attention", "Incompleto", profileIssue);
    } else {
      const profileSummary = state.rol.length
        ? `Cargo: ${state.rol[0]}.`
        : `${state.imprescindibles.length + state.atributos.length + state.deseables.length} señales.`;
      setReadiness(readinessProfile, "ready", "Configurado", profileSummary);
    }

    if (noLocationCheckbox.checked) {
      setReadiness(readinessLocation, "ready", "Sin límite", "El listado público sí requiere localidad y país.");
    } else if (!state.alcance.length) {
      setReadiness(readinessLocation, "attention", "Falta ubicación", "Elegí país y localidad, o buscá sin límite.");
    } else {
      const locationIssue = RadarTalentDiscovery.locationScopeError(state);
      setReadiness(readinessLocation, locationIssue ? "attention" : "ready", locationIssue ? "Revisar" : "Configurada", locationIssue || `Ubicación agregada: ${state.alcance.join(", ")}.`);
    }

    if (jdInput.value.trim() && jdNeedsReview) {
      setReadiness(readinessJd, "attention", "Revisar", "Confirmá los datos detectados.");
    } else if (jdInput.value.trim()) {
      setReadiness(readinessJd, "ready", "Confirmada", "Podés editar los campos arriba.");
    } else {
      setReadiness(readinessJd, "ready", "Manual", "Completá perfil y ubicación.");
    }
  }

  function renderChips(field) {
    hideGeneratedResults();
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
    updateSearchReadiness();
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
    if (noLocationCheckbox.checked) {
      state.alcance = [];
      countrySelect.value = "";
      renderChips("alcance");
    }
    updateSearchReadiness();
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
    if (resultsEl.classList.contains("show")) renderResults();
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
    const ambiguousLocationChoices = (result.ambiguousLocations || []).map((choice) => choice.locality ? `${choice.locality} · ${choice.country}` : choice.country);
    const descriptions = {
      source: ["¿El texto coincide con el original?", "La lectura puede estar incompleta. Comparala con el archivo antes de seguir."],
      intent: ["¿Es una descripción de un puesto?", "No parece una vacante. Si es una búsqueda real, completá cargo, conocimientos y ubicación."],
      role: result.rol.length
        ? [`¿Buscás ${result.rol[0]}?`, "Confirmá o corregí el cargo. También podés buscar por requisitos." ]
        : ["No detectamos el cargo.", "Escribilo o buscá por requisitos."],
      requirements: result.atributos.length || (result.imprescindibles || []).length || (result.atributosDeseables || []).length
        ? ["¿Qué es obligatorio?", "Las señales son alternativas: alcanza una. Marcá como imprescindibles solo las que deben cumplirse todas." ]
        : ["¿Qué distingue al perfil?", "Agregá una habilidad, tarea o experiencia concreta. Sin cargo, hacen falta señales suficientes para identificarlo."],
      signals: ["¿Cómo usamos estas herramientas?", "RADAR las dejó como puntos extra para no filtrar perfiles por una suposición. Decidí una por una."],
      sector: ["¿A qué te referís con “travel”?", "Puede ser tecnología para viajes o turismo y operaciones. Elegí el contexto; no lo tomamos como una herramienta obligatoria."],
      location: result.locationNeedsClarification
        ? ["El texto dice Santiago, pero falta el país.", "Indicá ciudad y país. RADAR no elige por vos entre localidades con el mismo nombre."]
        : ambiguousLocationChoices.length
        ? [`¿Qué ubicación corresponde: ${ambiguousLocationChoices.join(" o ")}?`, "Elegí ciudad y país para evitar una búsqueda en otro lugar."]
        : result.alcance.length
        ? [`¿La ubicación es ${result.alcance[result.alcance.length - 1]}?`, "Confirmala, ampliá al país o buscá sin ubicación." ]
        : [result.fileCountrySuggestion ? `El archivo menciona ${result.fileCountrySuggestion}, pero el texto no.` : "Falta la ubicación.", "Agregá una ubicación o elegí buscar sin ese filtro."],
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
        confirmBrief.textContent = "Sí, describe una búsqueda real";
        confirmBrief.addEventListener("click", () => {
          result.isBrief = true;
          renderJdReview(result);
        });
        row.appendChild(confirmBrief);
      }
      if (gap === "requirements" && (result.atributos.length || result.imprescindibles.length || (result.atributosDeseables || []).length)) {
        const confirmRequirements = document.createElement("button");
        confirmRequirements.type = "button";
        confirmRequirements.className = "jd-review-choice";
        confirmRequirements.textContent = result.atributos.length ? "Sí, usar estas señales" : "Confirmar estos requisitos";
        confirmRequirements.addEventListener("click", () => {
          RadarReview.accept(result, "requirements");
          renderJdReview(result);
        });
        row.appendChild(confirmRequirements);
      }
      if (gap === "signals") {
        (result.unverifiedSignals || []).forEach((term) => {
          const item = document.createElement("div");
          item.className = "brief-signal-review";
          const name = document.createElement("strong");
          name.textContent = term;
          item.appendChild(name);
          const choices = [
            ["Obligatorio: " + term, "required"],
            ["Solo suma: " + term, "desirable"],
            ["No usar: " + term, "remove"],
          ];
          choices.forEach(([label, action]) => {
            const choice = document.createElement("button");
            choice.type = "button";
            choice.className = "jd-review-choice";
            choice.textContent = label;
            choice.disabled = action === "required" && result.imprescindibles.length >= RadarGenerator.MAX_TERMS_PER_GROUP;
            choice.addEventListener("click", () => {
              const normalized = term.toLowerCase();
              const sameTerm = (value) => value.toLowerCase() === normalized;
              const unverifiedBefore = new Set((result.unverifiedSignals || []).map((value) => value.toLowerCase()));
              const knownBefore = [...result.atributos, ...result.imprescindibles, ...result.atributosDeseables.filter((value) => !unverifiedBefore.has(value.toLowerCase()))];
              result.atributos = (result.atributos || []).filter((value) => !sameTerm(value));
              result.imprescindibles = (result.imprescindibles || []).filter((value) => !sameTerm(value));
              result.atributosDeseables = (result.atributosDeseables || []).filter((value) => !sameTerm(value));
              const evidence = result.quality && result.quality.evidence;
              let signalEvidence = null;
              if (evidence) {
                for (const key of ["atributos", "atributosDeseables", "imprescindibles"]) {
                  const records = evidence[key] || [];
                  const found = records.find((record) => record.term.toLowerCase() === normalized);
                  if (found) signalEvidence = found;
                  evidence[key] = records.filter((record) => record.term.toLowerCase() !== normalized);
                }
              }
              if (action === "required") {
                if (result.imprescindibles.length < RadarGenerator.MAX_TERMS_PER_GROUP) result.imprescindibles.push(term);
                if (evidence && signalEvidence) (evidence.imprescindibles ||= []).push(signalEvidence);
              } else if (action === "desirable") {
                result.atributosDeseables.push(term);
                if (evidence && signalEvidence) (evidence.atributosDeseables ||= []).push(signalEvidence);
              }
              result.unverifiedSignals = result.unverifiedSignals.filter((value) => !sameTerm(value));
              if (!knownBefore.length && !result.unverifiedSignals.length) RadarReview.accept(result, "requirements");
              renderJdReview(result);
            });
            item.appendChild(choice);
          });
          row.appendChild(item);
        });
      }
      if (gap === "sector") {
        const choices = [
          ["Plataformas de viajes", ["travel tech", "travel technology"]],
          ["Turismo y operaciones", ["turismo", "travel"]],
          ["Ambos", ["travel tech", "turismo"]],
          ["No lo sé · incluir travel", ["travel"]],
        ];
        choices.forEach(([label, terms]) => {
          const choice = document.createElement("button");
          choice.type = "button";
          choice.className = "jd-review-choice";
          choice.textContent = label;
          choice.addEventListener("click", () => {
            result.dominio = terms.slice();
            result.sectorNeedsClarification = false;
            if (result.quality && result.quality.evidence) result.quality.evidence.dominio = [];
            RadarReview.accept(result, "sector");
            renderJdReview(result);
          });
          row.appendChild(choice);
        });
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
      if (gap === "location" && result.ambiguousLocations && result.ambiguousLocations.length) {
        result.ambiguousLocations.forEach((choice) => {
          const selectLocation = document.createElement("button");
          selectLocation.type = "button";
          selectLocation.className = "jd-review-choice";
          selectLocation.textContent = choice.locality ? `${choice.locality} · ${choice.country}` : choice.country;
          selectLocation.addEventListener("click", () => {
            result.country = choice.country;
            result.alcance = choice.locality ? [choice.country, choice.locality] : [choice.country];
            result.ambiguousLocations = [];
            RadarReview.accept(result, "location");
            renderJdReview(result);
          });
          row.appendChild(selectLocation);
        });
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
      if (gap !== "source" && gap !== "intent" && gap !== "requirements" && gap !== "sector") {
        const proceed = document.createElement("button");
        proceed.type = "button";
        proceed.className = "jd-review-choice";
      proceed.textContent = { role: "Buscar sin cargo", location: "Buscar sin ubicación" }[gap];
        proceed.addEventListener("click", () => {
          if (gap === "role") result.rol = [];
          if (gap === "location") {
            result.alcance = [];
            result.country = null;
            result.ambiguousLocations = [];
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
      : result.isBrief
        ? "Separé los datos de tu idea. Revisá el cargo, los conocimientos y la ubicación."
        : result.isJobPosting
          ? "Revisá cargo, requisitos y ubicación detectados."
        : "No parece una descripción de puesto. Completá el perfil a mano.";

    jdReviewGrid.textContent = "";
    const fields = [
      ["Cargo", result.rol, result.rol[0] && quality.evidence && quality.evidence.rol ? [{ term: result.rol[0], text: quality.evidence.rol }] : []],
      ["Obligatorios · se exigen todos", result.imprescindibles || [], quality.evidence && (quality.evidence.imprescindibles || quality.evidence.atributos), "imprescindibles"],
      ["Alternativas · alcanza una", result.atributos, quality.evidence && quality.evidence.atributos, "atributos"],
      ["Puntos extra · opcional", result.atributosDeseables || result.preferredAttributes, quality.evidence && (quality.evidence.atributosDeseables || quality.evidence.preferredAttributes), "atributosDeseables", true],
      ["Sector", result.dominio, quality.evidence && quality.evidence.dominio, "dominio"],
      ["Ubicación", result.alcance, quality.evidence && quality.evidence.alcance, "alcance"],
      ["Contexto · no filtra", [...(result.seniority || []), ...(result.modality || [])], []],
    ];
    fields.forEach(([label, terms, evidence, fieldName, promotable]) => {
      const card = document.createElement("div");
      card.className = "jd-review-field";
      const heading = document.createElement("h4");
      heading.textContent = label;
      card.appendChild(heading);
      if (label === "Cargo") {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "jd-review-role-input";
        input.maxLength = 80;
        input.value = (terms || [])[0] || "";
        input.placeholder = "Cargo que podría figurar en el perfil";
        input.setAttribute("aria-label", "Revisar cargo");
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
      !((result.atributos.length || (result.imprescindibles || []).length || (result.unverifiedSignals || []).length) && warning.startsWith("No detectamos requisitos")) &&
      !(result.alcance.length && warning.startsWith("No detectamos una ubicación")) &&
      !(result.reviewAccepted && result.reviewAccepted.location && warning.startsWith("No detectamos una ubicación")) &&
      !((result.rol.length || (result.reviewAccepted && result.reviewAccepted.role)) && warning.startsWith("No pudimos identificar el título"))
    );
    jdReviewWarning.textContent = warnings.join(" ");
    jdReviewWarning.classList.toggle("hidden", warnings.length === 0 && (result.isJobPosting || result.isBrief));
    if (!result.isJobPosting && !result.isBrief && !result.isResume && warnings.length === 0) {
      jdReviewWarning.textContent = "Faltan datos para reconocer una búsqueda. Revisá estos campos antes de aplicarlos.";
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
    networkOptionsCard.classList.add("hidden");
    jdReview.classList.add("hidden");
    pendingAnalysis = null;
    jdNeedsReview = false;
    updateSearchReadiness();
    document.getElementById("chips-rol").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function runAnalysis(fileName, sourceMeta) {
    const text = jdInput.value;
    if (!text.trim()) {
      showError("Pegá o adjuntá una descripción antes de analizar.", "file");
      return;
    }
    jdNeedsReview = true;
    updateSearchReadiness();
    const result = RadarExtractor.analyzeJD(text, {
      fileName: typeof fileName === "string" ? fileName : currentFileName,
      sourceMeta: sourceMeta === undefined ? currentSourceMeta : sourceMeta,
    });
    if (intakeMode === "idea" && !result.isResume) {
      result.isBrief = true;
      result.quality.warnings = (result.quality.warnings || []).filter((warning) => !warning.startsWith("El texto es muy breve"));
    }
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
    networkOptionsCard.classList.add("hidden");
    updateSearchReadiness();
  });
  descriptionModeBtn.addEventListener("click", () => setIntakeMode("description"));
  ideaModeBtn.addEventListener("click", () => setIntakeMode("idea"));
  document.querySelectorAll("[data-profile-example]").forEach((button) => {
    button.addEventListener("click", () => {
      setIntakeMode("idea");
      jdInput.value = button.dataset.profileExample || "";
      jdInput.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("analyzeBtn").click();
      jdReview.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  experienceModeButtons.forEach((button) => {
    button.addEventListener("click", () => setExperienceMode(button.dataset.experienceMode));
  });
  document.getElementById("analyzeBtn").addEventListener("click", () => runAnalysis());
  document.getElementById("applyJdBtn").addEventListener("click", applyPendingAnalysis);
  document.getElementById("dismissJdBtn").addEventListener("click", () => jdReview.classList.add("hidden"));
  aiAnalyzeJdBtn.addEventListener("click", async () => {
    if (!pendingAnalysis || !jdInput.value.trim()) return;
    const sourceText = jdInput.value;
    aiAnalyzeJdBtn.disabled = true;
    jdReviewAiStatus.classList.remove("hint-error");
    jdReviewAiStatus.textContent = "Analizando el texto con Gemini…";
    try {
      const aiResult = await RadarAI.analyzeJD(sourceText);
      if (jdInput.value !== sourceText) {
        jdReviewAiStatus.textContent = "El texto cambió durante el análisis. Volvé a analizarlo.";
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
      jdReviewAiStatus.textContent = err.message || "No se pudo analizar el texto con Gemini.";
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
    networkOptionsCard.classList.add("hidden");
    updateSearchReadiness();
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

  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) setIntakeMode("description");
    loadTextFile(e.target.files[0]);
  });

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
    const queryState = {
      ...state,
      rol: RadarTalentDiscovery.compactRoleFamily(state.rol, state.seniority),
    };
    document.querySelectorAll("[data-outcome]").forEach((button) => {
      button.disabled = false;
      button.setAttribute("aria-pressed", "false");
    });
    outcomeStatus.textContent = "";
    const universal = RadarGenerator.buildUniversalBoolean(queryState, relaxed);
    document.getElementById("out-universal").textContent = universal;
    const requiredCount = state.imprescindibles.length;
    const alternativeCount = state.atributos.length;
    const requiredSummary = requiredCount ? `${requiredCount} obligatoria${requiredCount === 1 ? "" : "s"}` : "sin obligatorias";
    const alternativeSummary = alternativeCount ? `${alternativeCount} alternativa${alternativeCount === 1 ? "" : "s"}` : "sin alternativas";
    const optionalSummary = state.deseables.length
      ? relaxed ? "incluye deseables" : "omite deseables"
      : "sin deseables";
    const sectorSummary = relaxed ? "sin sector" : state.dominio.length ? `sector: ${state.dominio.join(" / ")}` : "sin sector";
    const locationSummary = state.alcance.length ? `ubicación: ${state.alcance[state.alcance.length - 1]}` : "sin restricción geográfica";
    const roleSummary = state.rol.length ? `cargo: ${state.rol.join(" / ")}` : "sin cargo, por conocimientos";
    strategyNote.textContent = `${roleSummary} · ${requiredSummary} · ${alternativeSummary} · ${optionalSummary} · ${sectorSummary} · ${locationSummary}.`;
    const truncated = RadarGenerator.getTruncatedFields(state);
    const friendlyField = { rol: "Cargo", imprescindibles: "Imprescindibles", atributos: "Alternativas", deseables: "Puntos extra", dominio: "Sector", alcance: "Ubicación" };
    generatorWarning.textContent = truncated.length
      ? "Se admiten hasta 6 términos por grupo. Quitá los menos importantes de: " + truncated.map((field) => friendlyField[field] || field).join(", ") + "."
      : "";
    generatorWarning.classList.toggle("hidden", truncated.length === 0);

    const net = RadarNetworks.NETWORKS[selectedNetwork];

    resultLinkedinNative.classList.toggle("hidden", selectedNetwork !== "linkedin");
    if (selectedNetwork === "linkedin") {
      const tiers = RadarGenerator.buildLinkedinBooleanTiers(queryState);
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
          ? "Busca por requisitos y ubicación"
          : tier.label.includes("Específica")
            ? "Cargo, filtros y ubicación"
            : tier.label.includes("Equilibrada")
              ? state.deseables.length ? "Incluye una señal deseable" : state.atributos.length ? "Incluye una señal alternativa" : "Cargo, requisitos y ubicación"
              : "Cargo, requisitos y ubicación";
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
        xrayQuery = RadarGenerator.buildResumesQuery(queryState, relaxed);
        label = "Búsqueda — " + net.label;
        xrayTiersEl.textContent = "";
      } else {
        const siteDomain = selectedNetwork === "custom" ? customSiteInput.value.trim().replace(/^https?:\/\//, "") : net.site;
        const tiers = RadarGenerator.buildXRayTiers(queryState, siteDomain, relaxed, net.looseRol);
        xrayQuery = tiers[0] ? tiers[0].query : RadarGenerator.buildXRayQuery(queryState, siteDomain, relaxed, net.looseRol);
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
        label = "Google · perfiles públicos en " + net.label;
      }
      document.getElementById("out-xray").textContent = xrayQuery;
      document.getElementById("xrayNetworkLabel").textContent = label;
      document.getElementById("openGoogle").href = RadarGenerator.googleUrl(xrayQuery);
      document.getElementById("openBing").href = RadarGenerator.bingUrl(xrayQuery);
      document.getElementById("xrayNote").textContent = NOTES[selectedNetwork] || "";
    }

    resultsEl.classList.add("show");
    networkOptionsCard.classList.remove("hidden");
    renderPublicSearchSources();
    renderOutcomeSummary();
    return universal;
  }

  function renderPublicSearchSources() {
    const recommended = RadarNetworks.recommendNetworks(state).map((entry) => entry.id);
    const allowed = RadarTalentDiscovery.PUBLIC_SOURCE_IDS;
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
      publicSearchConfigNote.textContent = "Solo se envían cargo, señales y ubicación.";
    } else {
      publicSearchConfigNote.textContent = "Servicio no configurado. La clave no se expone en el navegador.";
    }
    publicSearchStatus.textContent = "";
    publicSearchResults.replaceChildren();
    publicSearchRows = [];
    publicSearchRefine.classList.add("hidden");
  }

  function renderPublicProfileResults(rows, sourceErrors, locationContext) {
    publicSearchResults.replaceChildren();
    const confirmedRows = rows.filter((row) => row.locationConfirmed);
    const reviewLocationRows = rows.filter((row) => !row.locationConfirmed);
    publicShareRows = new Map(confirmedRows.map((row) => [row.url, row]));
    if (locationContext) {
      const geography = document.createElement("p");
      geography.className = "public-search-geography";
      geography.textContent = locationContext.mode === "provider_location" && locationContext.canonicalName
        ? `Búsqueda en ${locationContext.canonicalName}. Confirmá residencia en el perfil.`
        : `Ubicación aplicada${locationContext.countryCode ? ` · ${locationContext.countryCode}` : ""}. Se excluyen resultados sin ciudad y país visibles.`;
      publicSearchResults.appendChild(geography);
    }
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "public-search-empty";
      empty.textContent = sourceErrors && sourceErrors.length
        ? "Las fuentes respondieron sin perfiles verificables. Las que fallaron quedan pendientes."
        : "No hubo señales públicas suficientes para confirmar el perfil, sus requisitos y la ubicación. Revisá los criterios o probá otra ruta.";
      publicSearchResults.appendChild(empty);
    } else {
      const summary = document.createElement("div");
      summary.className = "public-search-results-heading";
      const resultCount = document.createElement("strong");
      resultCount.textContent = rows.length === 1
        ? "1 perfil público para revisar"
        : `${rows.length} perfiles públicos para revisar`;
      const summaryNote = document.createElement("span");
      summaryNote.textContent = `${confirmedRows.length} con ciudad y país visibles · ${reviewLocationRows.length} con ciudad visible y país por confirmar.`;
      summary.append(resultCount, summaryNote);
      publicSearchResults.appendChild(summary);
      if (reviewLocationRows.length) {
        const reviewNote = document.createElement("p");
        reviewNote.className = "public-search-location-review";
        reviewNote.textContent = "Estos perfiles mencionan la localidad, pero el resultado público no confirma el país o la residencia actual. Revisalos en LinkedIn antes de contarlos como coincidencias.";
        publicSearchResults.appendChild(reviewNote);
      }
      const shareTools = document.createElement("div");
      shareTools.className = "public-profile-share-tools";
      shareTools.setAttribute("aria-label", "Compartir perfiles seleccionados");
      const selectAllLabel = document.createElement("label");
      selectAllLabel.className = "public-profile-select-all";
      const selectAll = document.createElement("input");
      selectAll.id = "publicShareSelectAll";
      selectAll.type = "checkbox";
      selectAll.disabled = confirmedRows.length === 0;
      selectAllLabel.append(selectAll, document.createTextNode(confirmedRows.length
        ? `Seleccionar los ${confirmedRows.length} con ubicación confirmada`
        : "Sin ubicación confirmada para compartir"));
      const selectedCount = document.createElement("span");
      selectedCount.id = "publicShareSelectionCount";
      selectedCount.setAttribute("aria-live", "polite");
      selectedCount.textContent = "0 seleccionados";
      const emailButton = document.createElement("button");
      emailButton.id = "shareProfilesEmailBtn";
      emailButton.type = "button";
      emailButton.className = "btn btn-ghost public-profile-share-button";
      emailButton.textContent = "Preparar correo";
      emailButton.disabled = true;
      const whatsappButton = document.createElement("button");
      whatsappButton.id = "shareProfilesWhatsappBtn";
      whatsappButton.type = "button";
      whatsappButton.className = "btn btn-ghost public-profile-share-button";
      whatsappButton.textContent = "Abrir WhatsApp";
      whatsappButton.disabled = true;
      const shareHint = document.createElement("span");
      shareHint.id = "publicShareHint";
      shareHint.className = "public-profile-share-hint";
      shareHint.textContent = confirmedRows.length
        ? "Solo se pueden compartir perfiles con localidad y país visibles. Revisá el borrador antes de enviarlo."
        : "Confirmá localidad y país en la fuente antes de preparar un mensaje.";
      shareTools.append(selectAllLabel, selectedCount, emailButton, whatsappButton, shareHint);
      publicSearchResults.appendChild(shareTools);
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
        name.textContent = row.name || "Nombre no visible";
        const headline = document.createElement("span");
        headline.textContent = row.title;
        title.append(name, headline);
        const score = document.createElement("span");
        score.className = "public-profile-score";
        const scoreValue = document.createElement("strong");
        scoreValue.textContent = `${row.score}/100`;
        const scoreLabel = document.createElement("small");
        scoreLabel.textContent = row.identityAlignment === "mismatch"
          ? "Identidad por revisar"
          : !row.locationConfirmed ? "Ubicación por revisar" : row.confidence;
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
        location.className = row.locationConfirmed ? "public-profile-location is-confirmed" : "public-profile-location is-unverified";
        location.textContent = row.locationStatus;
        const identityCheck = document.createElement("span");
        identityCheck.className = row.identityAlignment === "mismatch" ? "public-profile-identity-warning" : "public-profile-identity-check";
        identityCheck.textContent = row.identityStatus;
        meta.append(source, location, identityCheck);
        if (row.locationConfirmed) {
          const includeLabel = document.createElement("label");
          includeLabel.className = "public-profile-share-select";
          const includeInput = document.createElement("input");
          includeInput.type = "checkbox";
          includeInput.className = "public-profile-share-checkbox";
          includeInput.value = row.url;
          includeInput.setAttribute("aria-label", `Incluir ${row.name || row.title} al mensaje`);
          includeLabel.append(includeInput, document.createTextNode("Compartir"));
          meta.appendChild(includeLabel);
        }

        const snippet = document.createElement("p");
        snippet.className = "public-profile-snippet";
        snippet.textContent = row.snippet || "Sin descripción pública.";
        const details = document.createElement("details");
        details.className = "public-profile-details";
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "Ver coincidencias";
        const evidence = document.createElement("p");
        evidence.className = "public-profile-evidence";
        const signalText = row.visibleSignals.length ? `Coincidencias: ${row.visibleSignals.join(" · ")}. ` : "Sin coincidencias claras. ";
        evidence.textContent = `${signalText}Identidad: ${row.identityStatus}. Evidencia: ${row.scoreBreakdown.join(" · ")}.`;
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
      partial.textContent = `No respondió ${failedLabels.join(", ")}. Podés reintentar esa fuente.`;
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
    const nextActions = document.createElement("aside");
    nextActions.className = "public-search-next-actions";
    const nextTitle = document.createElement("strong");
    nextTitle.textContent = "Seguí con otras rutas";
    const nextCopy = document.createElement("span");
    nextCopy.textContent = "Probá la consulta en otros portales o buscá perfiles públicos desde Google.";
    const nextLink = document.createElement("a");
    nextLink.className = "btn btn-ghost btn-small";
    nextLink.href = "#results";
    nextLink.textContent = "Ver consultas y portales";
    nextActions.append(nextTitle, nextCopy, nextLink);
    publicSearchResults.appendChild(nextActions);
    updatePublicShareControls();
  }

  function renderSourceDiagnostics(diagnostics) {
    if (!Array.isArray(diagnostics) || !diagnostics.length) return null;
    const section = document.createElement("section");
    section.className = "public-search-diagnostics";
    section.setAttribute("aria-label", "Resultado por fuente");
    const heading = document.createElement("strong");
    heading.textContent = "Estado por fuente";
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
    const providerErrorMessages = {
      provider_rate_limited: "alcanzó el límite",
      provider_timeout: "agotó el tiempo de espera",
      provider_network_error: "no respondió",
      provider_credentials_rejected: "rechazó la clave",
      provider_unavailable: "no está disponible",
      source_unavailable: "no está disponible",
    };
    diagnostics.forEach((item) => {
      const entry = document.createElement("li");
      const label = RadarTalentDiscovery.SOURCES[item.source]?.label || item.source;
      let detail = "No hubo diagnóstico disponible.";
      if (item.status === "error") detail = errorMessages[item.code] || "No se pudo completar la consulta.";
      else if (item.status === "profiles_found") detail = `${item.profileCount} enlaces de perfil reconocibles de ${item.organicCount} resultados; la pertinencia se revisa aparte.`;
      else if (item.status === "no_public_profiles") detail = `Hubo ${item.organicCount} resultados, pero ninguno era un perfil reconocible.`;
      else if (item.status === "no_indexed_results") detail = "Sin resultados indexados para estos términos.";
      const engines = Array.isArray(item.engines) && item.engines.length ? ` · ${item.engines.join(" + ")}` : "";
      const providerErrors = Array.isArray(item.providerErrors) ? item.providerErrors
        .map((error) => `${error.provider} ${providerErrorMessages[error.code] || "tuvo un problema"}`) : [];
      const providerNote = providerErrors.length ? ` (${providerErrors.join("; ")})` : "";
      entry.textContent = `${label}${engines}: ${detail}${providerNote}`;
      list.appendChild(entry);
    });
    section.append(heading, list);
    return section;
  }

  function renderNoMatchContext(diagnostics) {
    if (!Array.isArray(diagnostics)) return null;
    const recognizableProfiles = diagnostics.reduce((total, item) => (
      item && item.status === "profiles_found" ? total + (Number(item.profileCount) || 0) : total
    ), 0);
    if (!recognizableProfiles) return null;

    const note = document.createElement("p");
    note.className = "public-search-no-match-context";
    note.textContent = `El buscador encontró ${recognizableProfiles} enlaces que parecen perfiles, pero la información pública no alcanza para confirmar los requisitos y la ubicación. Por eso no se incluyen en la lista. Probá perfiles equivalentes o abrí las otras rutas de hunting.`;
    return note;
  }

  function renderFinalNoResultQuestions() {
    const section = document.createElement("section");
    section.className = "public-search-next-questions";
    section.setAttribute("aria-label", "Preguntas para seguir refinando la búsqueda");
    const title = document.createElement("strong");
    title.textContent = "¿Qué querés ajustar?";
    const explanation = document.createElement("p");
    explanation.textContent = "No hubo perfiles verificables. Elegí qué criterio revisar; RADAR no cambia requisitos por su cuenta.";
    section.append(title, explanation);
    const questions = [
      { label: "¿El cargo puede tener otro nombre?", selector: '[data-field="rol"]' },
      { label: "¿Algún imprescindible admite equivalencias?", selector: '[data-field="imprescindibles"]' },
      { label: "¿Podemos ampliar la ubicación?", selector: '[data-field="alcance"]' },
    ];
    questions.forEach(({ label, selector }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jd-review-choice";
      button.textContent = label;
      button.addEventListener("click", () => {
        const target = document.querySelector(selector);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      });
      section.appendChild(button);
    });
    publicSearchResults.appendChild(section);
  }

  function selectedPublicShareRows() {
    const selectedUrls = new Set([...publicSearchResults.querySelectorAll(".public-profile-share-checkbox:checked")].map((input) => input.value));
    return [...publicShareRows.values()].filter((row) => selectedUrls.has(row.url));
  }

  function publicShareMessage(rows) {
    const clean = (value, maxLength) => String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
    const role = clean(state.rol.join(", "), 120);
    const location = clean(state.alcance.join(", "), 120);
    const lines = ["RADAR — perfiles públicos para revisar"];
    if (role) lines.push(`Búsqueda: ${role}`);
    if (location) lines.push(`Ubicación indicada: ${location}`);
    lines.push("");
    rows.forEach((row, index) => {
      lines.push(`${index + 1}. ${clean(row.name || "Nombre no visible", 70)} — ${clean(row.title, 120)} (${clean(row.sourceLabel, 40)})`);
      lines.push(row.url, "");
    });
    lines.push("Verificá identidad, experiencia y ubicación. El orden no determina idoneidad.");
    return lines.join("\n");
  }

  function updatePublicShareControls() {
    const toolbar = publicSearchResults.querySelector(".public-profile-share-tools");
    if (!toolbar) return;
    const selected = selectedPublicShareRows();
    const message = publicShareMessage(selected);
    const emailUrl = `mailto:?subject=${encodeURIComponent("Perfiles públicos para revisar — RADAR")}&body=${encodeURIComponent(message)}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    const count = toolbar.querySelector("#publicShareSelectionCount");
    const all = toolbar.querySelector("#publicShareSelectAll");
    const email = toolbar.querySelector("#shareProfilesEmailBtn");
    const whatsapp = toolbar.querySelector("#shareProfilesWhatsappBtn");
    const hint = toolbar.querySelector("#publicShareHint");
    count.textContent = `${selected.length} seleccionados`;
    all.checked = publicShareRows.size > 0 && selected.length === publicShareRows.size;
    all.indeterminate = selected.length > 0 && selected.length < publicShareRows.size;
    email.disabled = selected.length === 0 || emailUrl.length > MAX_SHARE_URL_LENGTH;
    whatsapp.disabled = selected.length === 0 || selected.length > MAX_WHATSAPP_SHARE_PROFILES || whatsappUrl.length > MAX_SHARE_URL_LENGTH;
    if (selected.length > MAX_WHATSAPP_SHARE_PROFILES) {
      hint.textContent = "WhatsApp admite hasta 8 perfiles por mensaje.";
    } else if (emailUrl.length > MAX_SHARE_URL_LENGTH) {
      hint.textContent = "El correo es demasiado largo. Reducí la selección; WhatsApp admite hasta 8.";
    } else if (publicShareRows.size === 0) {
      hint.textContent = "Confirmá localidad y país en la fuente antes de preparar un mensaje.";
    } else if (publicSearchRows.some((row) => !row.locationConfirmed)) {
      hint.textContent = "Solo se comparten perfiles con localidad y país visibles. Revisá el borrador antes de enviarlo.";
    } else {
      hint.textContent = "Elegí perfiles y revisá el borrador antes de enviarlo.";
    }
    email.dataset.shareUrl = emailUrl;
    whatsapp.dataset.shareUrl = whatsappUrl;
  }

  publicSearchResults.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "publicShareSelectAll") {
      publicSearchResults.querySelectorAll(".public-profile-share-checkbox").forEach((checkbox) => { checkbox.checked = target.checked; });
      updatePublicShareControls();
    } else if (target.matches(".public-profile-share-checkbox")) {
      updatePublicShareControls();
    }
  });

  publicSearchResults.addEventListener("click", (event) => {
    const button = event.target.closest("#shareProfilesEmailBtn, #shareProfilesWhatsappBtn");
    if (!button || button.disabled || !button.dataset.shareUrl) return;
    window.open(button.dataset.shareUrl, "_blank", "noopener,noreferrer");
  });

  function renderPublicSearchError(error) {
    publicSearchResults.replaceChildren();
    const monthlyQuotaExhausted = error instanceof Error && /cupo gratuito del mes/i.test(error.message);
    const retrySources = [...new Set((error && error.sourceDiagnostics || [])
      .filter((item) => item && item.status === "error" && RadarTalentDiscovery.SOURCES[item.source])
      .map((item) => item.source))];
    const panel = document.createElement("section");
    panel.className = "public-search-error";
    panel.setAttribute("role", "alert");
    const heading = document.createElement("strong");
    heading.textContent = monthlyQuotaExhausted ? "Se agotó el cupo gratuito de LinkedIn" : "No pudimos consultar las fuentes";
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : "La consulta no pudo completarse.";
    const note = document.createElement("span");
    note.textContent = monthlyQuotaExhausted
      ? "El cupo de SerpApi se renueva cada mes. RADAR no hizo la búsqueda; podés seguir en los portales sin consumir consultas."
      : "No se reintenta automáticamente para cuidar el cupo. Un reintento manual puede usar otra búsqueda gratuita.";
    panel.append(heading, message, note);
    const diagnostics = renderSourceDiagnostics(error && error.sourceDiagnostics);
    if (diagnostics) panel.appendChild(diagnostics);
    const fallback = createManualSearchFallback(monthlyQuotaExhausted);
    if (fallback) panel.appendChild(fallback);
    if (retrySources.length) {
      const retryButton = document.createElement("button");
      retryButton.className = "btn btn-ghost btn-small public-search-retry";
      retryButton.type = "button";
      retryButton.textContent = `Reintentar ${retrySources.map((source) => RadarTalentDiscovery.SOURCES[source].label).join(" + ")} · puede usar cupo`;
      retryButton.addEventListener("click", () => runPublicProfileSearch(publicSearchStrategy, retrySources));
      panel.appendChild(retryButton);
    }
    publicSearchResults.appendChild(panel);
  }

  function createManualSearchFallback(monthlyQuotaExhausted = false) {
    const routes = [
      { selector: "#openGoogle", label: "Abrir Google X-Ray" },
      { selector: "#openBing", label: "Abrir Bing X-Ray" },
      { selector: "#linkedinTiers a", label: "Buscar en LinkedIn" },
    ];
    const available = routes.map((route) => ({ ...route, source: document.querySelector(route.selector) }))
      .filter((route) => route.source && /^https:\/\//i.test(route.source.getAttribute("href") || ""));
    if (!available.length) return null;
    const section = document.createElement("div");
    section.className = "public-search-fallback";
    const explanation = document.createElement("p");
    explanation.textContent = monthlyQuotaExhausted
      ? "Seguí con estos buscadores mientras vuelve el cupo. La búsqueda manual no consume consultas de SerpApi."
      : "La búsqueda manual sigue disponible y no consume consultas de SerpApi.";
    section.appendChild(explanation);
    available.forEach(({ label, source }) => {
      const link = document.createElement("a");
      link.href = source.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = label;
      section.appendChild(link);
    });
    return section;
  }

  async function runPublicProfileSearch(strategy, sourceOverride) {
    const publicSearchEndpoint = getPublicSearchEndpoint();
    if (!publicSearchEndpoint) return;
    const locationError = RadarTalentDiscovery.locationScopeError(state);
    if (locationError) {
      publicSearchStatus.textContent = `${locationError} No se consumió cupo.`;
      document.querySelector('[data-field="alcance"]')?.focus({ preventScroll: true });
      return;
    }
    const selected = sourceOverride || [...publicSearchSources.querySelectorAll('input[name="publicSearchSource"]:checked')].map((input) => input.value);
    if (!selected.length || selected.length > RadarTalentDiscovery.MAX_SOURCES || selected.some((source) => !RadarTalentDiscovery.PUBLIC_SOURCE_IDS.includes(source))) {
      publicSearchStatus.textContent = "Elegí LinkedIn, GitHub o ambas fuentes.";
      return;
    }
    const sequence = ++publicSearchSequence;
    const plan = RadarTalentDiscovery.buildPlan(state, selected, RadarGenerator, { strategy });
    if (!plan.queries.length) {
      publicSearchStatus.textContent = plan.skippedReasons.github === "requires_language_signal"
        ? "GitHub sirve para perfiles técnicos: agregá un lenguaje de programación o elegí LinkedIn."
        : "La consulta quedó demasiado extensa. Quitá algunas señales e intentá de nuevo.";
      return;
    }
    findProfilesBtn.disabled = true;
    findProfilesBtn.textContent = "Buscando perfiles…";
    broadenPublicSearchBtn.disabled = true;
    publicSearchRefine.classList.add("hidden");
    if (strategy === "precise" && !sourceOverride) publicSearchRows = [];
    publicSearchStrategy = strategy;
    const skippedNote = plan.skippedSources.length
      ? ` ${plan.skippedSources.map((source) => plan.skippedReasons[source] === "requires_language_signal"
        ? `Se omitió ${RadarTalentDiscovery.SOURCES[source].label}: esta fuente sirve para perfiles técnicos y falta indicar un lenguaje o tecnología que pueda contrastar.`
        : `Se omitió ${RadarTalentDiscovery.SOURCES[source].label} porque la consulta es demasiado extensa.`).join(" ")}`
      : "";
    const sourceNames = plan.queries.map((query) => query.label).join(" + ");
    const linkedinQuotaNote = plan.queries.some((query) => query.source === "linkedin")
      ? " LinkedIn puede usar 1 búsqueda SerpApi; una repetición idéntica puede salir de caché."
      : " GitHub usa su límite gratuito por hora, sin consumir SerpApi.";
    publicSearchStatus.textContent = sourceOverride
      ? `Reintentando ${plan.searchSummary || "perfil y ubicación"} en ${sourceNames}.${linkedinQuotaNote}`
      : `Buscando ${plan.searchSummary || "con los criterios confirmados"} en ${sourceNames}.${linkedinQuotaNote}${skippedNote}`;
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
      const noMatchContext = count ? null : renderNoMatchContext(response.sourceDiagnostics);
      if (noMatchContext) publicSearchResults.appendChild(noMatchContext);
      const partial = response.sourceErrors.length > 0;
      const confirmedCount = publicSearchRows.filter((row) => row.locationConfirmed).length;
      const locationReviewCount = count - confirmedCount;
      publicSearchStatus.textContent = count
        ? `${partial ? "Resultado parcial" : "Listo"}: ${count} ${count === 1 ? "perfil" : "perfiles"}; ${confirmedCount} con ubicación confirmada y ${locationReviewCount} para revisar.`
        : partial
          ? "Respuesta parcial: no hubo perfiles verificables y algunas fuentes fallaron."
          : "Búsqueda completada: sin perfiles verificables.";
      if (count <= 3 && strategy !== "market") {
        const nextStrategy = strategy === "precise" ? "equivalent" : "market";
        broadenPublicSearchBtn.dataset.strategy = nextStrategy;
        broadenPublicSearchBtn.textContent = nextStrategy === "equivalent" ? "Probar perfiles equivalentes" : "Ampliar sin cargo ni sector";
        publicSearchRefineTitle.textContent = count ? `Hay ${count} perfiles. ¿Ampliamos?` : "Sin perfiles verificables.";
        const retryNote = partial
          ? " Hay fuentes con error; podés reintentarlas por separado sin volver a consultar las demás."
          : "";
        publicSearchRefineText.textContent = nextStrategy === "equivalent"
          ? `Busca por requisitos sin exigir el título. Conserva ubicación y obligatorias. Consume una consulta adicional por fuente.${retryNote}`
          : `Quita cargo y sector; conserva ubicación y obligatorias. Consume una consulta adicional por fuente.${retryNote}`;
        publicSearchRefine.classList.remove("hidden");
      } else {
        publicSearchRefine.classList.add("hidden");
      }
      if (!count && !partial && strategy === "market") renderFinalNoResultQuestions();
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
      showError("El texto cambió. Volvé a analizarlo o borrálo para seguir a mano.");
      return;
    }
    if (selectedNetwork === "custom" && !customSiteInput.value.trim()) {
      showError("Indicá el sitio donde querés buscar perfiles.");
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
    setIntakeMode("description");
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
    networkOptionsCard.classList.add("hidden");
    Object.values(errorSlots).forEach((el) => (el.textContent = ""));
    renderRefinarSuggestions([]);
    generatorWarning.classList.add("hidden");
    updateSearchReadiness();
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
      empty.textContent = "Todavía no preparaste ninguna consulta en este navegador.";
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
    setIntakeMode("description");
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
    updateSearchReadiness();
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
  const testAiKeyBtn = document.getElementById("testAiKeyBtn");

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
    aiKeyHint.classList.remove("hint-error");
    aiKeyHint.textContent = "Key guardada en este navegador. Probá la conexión antes de usar Gemini.";
    renderSynonyms();
  });
  testAiKeyBtn.addEventListener("click", async () => {
    testAiKeyBtn.disabled = true;
    aiKeyHint.classList.remove("hint-error");
    aiKeyHint.textContent = "Comprobando acceso al modelo…";
    try {
      await RadarAI.testConnection();
      aiKeyHint.textContent = "Conexión correcta: el modelo está accesible. La prueba no genera texto.";
      renderSynonyms();
    } catch (err) {
      aiKeyHint.classList.add("hint-error");
      aiKeyHint.textContent = err.message || "No se pudo validar el acceso a Gemini.";
    } finally {
      testAiKeyBtn.disabled = false;
    }
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
