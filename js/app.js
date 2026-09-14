// UI layer. Talks to extractor.js / generator.js, never touches innerHTML with user input.
(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Access gate. NOTE this is a lobby door, not a lock: the repo is public,
  // so the password below is one "view source" away from anyone who looks —
  // it keeps the tool from showing up cold to a random visitor or search
  // crawler, it does not protect the JD text or booleans from someone who
  // actually wants in. js/gate.js already flips <html class="authed"> before
  // paint for a returning visitor; this only wires up the form for a first
  // visit on this browser.
  // ---------------------------------------------------------------
  const AUTH_KEY = "radar-auth-v1";
  const AUTH_PASSWORD = "MinDataTeam";
  const authGateForm = document.getElementById("authGateForm");
  const authGatePassword = document.getElementById("authGatePassword");
  const authGateError = document.getElementById("authGateError");

  authGateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (authGatePassword.value === AUTH_PASSWORD) {
      try {
        localStorage.setItem(AUTH_KEY, "ok");
      } catch (err) {
        // private browsing / storage disabled — still unlocks this load,
        // just won't be remembered next time
      }
      document.documentElement.classList.add("authed");
      authGateError.textContent = "";
    } else {
      authGateError.textContent = "Contraseña incorrecta.";
      authGatePassword.value = "";
      authGatePassword.focus();
    }
  });

  const FIELDS = ["rol", "atributos", "dominio", "alcance", "refinar"];
  const MAX_TXT_BYTES = 500 * 1024;
  const MAX_PDF_BYTES = 8 * 1024 * 1024;

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
  }

  const state = { rol: [], atributos: [], dominio: [], alcance: [], refinar: [] };
  let selectedNetwork = "linkedin";

  // Qué tipo de perfil aparece en cada red y con qué confianza, según pruebas
  // en vivo (no supuestos): ver TESTING.md, sección "Auditoría de redes".
  const NETWORK_DESCRIPTIONS = {
    linkedin:
      "Usá el botón \"Buscar en LinkedIn\" de abajo — no depende de que Google tenga nada indexado, y es donde vive la mayoría de los perfiles. El X-Ray de al lado es el plan B: anda bien en Google para cualquier rubro y país (probado con desarrollo, SAP, ciberseguridad y telecomunicaciones), pero Bing ya ni respeta el site:, no lo uses ahí.",
    github:
      "Developers y perfiles de datos con actividad pública en GitHub. Probado con Backend + Python en Argentina: más de cien resultados reales. Fuera de lo técnico no hay nada que buscar acá.",
    stackoverflow:
      "Gente con historial real respondiendo o preguntando: dev, QA, data, DevOps. El puesto no va entre comillas — casi nadie escribe su cargo tal cual en la bio, así que se busca suelto. Para roles comerciales no sirve, ahí no hay actividad.",
    xing: "Equivalente a LinkedIn pero en Alemania, Austria y Suiza. El país se busca en el idioma del perfil, no en español (\"Germany\", no \"Alemania\") porque así lo escriben de verdad. Fuera de esa zona apenas hay usuarios.",
    behance:
      "Portfolios de diseño, UX/UI e ilustración. Anda muy bien — algunos perfiles hasta dicen \"en búsqueda activa\". Para cualquier otro rubro no va a traer nada, ni vale la pena intentarlo.",
    resumes:
      "CVs colgados en sitios personales o blogs, fuera de las redes profesionales — con mail y teléfono directo, a veces mejor que un perfil de LinkedIn. Sirve para cualquier rubro, con menos volumen.",
    custom:
      "Para portales de empleo locales (Bumeran, Computrabajo, InfoJobs) o cualquier sitio propio. La calidad depende de cuánto indexe Google ese sitio puntual, no de RADAR.",
  };

  const NOTES = {
    linkedin: "Este X-Ray es el respaldo — para buscar de verdad usá el botón de arriba, no depende de Google ni Bing.",
    stackoverflow: "El puesto se busca suelto, no entre comillas — en Stack Overflow nadie escribe su cargo tal cual.",
    xing: "Fuerte en Alemania, Austria y Suiza. El país va en inglés para que matchee con el perfil real.",
    behance: "Portfolios públicos de diseño, UX/UI e ilustración. Fuera de ese rubro no trae nada.",
    resumes: "Busca PDF/Word sueltos en toda la web, currículums publicados fuera de las redes profesionales.",
    custom: "Ajustá el dominio arriba. El site: funciona igual en cualquier sitio que Google tenga indexado.",
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
  const networkTabsEl = document.getElementById("networkTabs");
  const networkDescriptionEl = document.getElementById("networkDescription");
  const customSiteRow = document.getElementById("customSiteRow");
  const customSiteInput = document.getElementById("customSiteInput");
  const githubModeRow = document.getElementById("githubModeRow");
  const starsInputWrap = document.getElementById("starsInputWrap");
  const minStarsInput = document.getElementById("minStars");
  const resultsEl = document.getElementById("results");
  const resultXray = document.getElementById("resultXray");
  const resultGithub = document.getElementById("resultGithub");
  const resultLinkedinNative = document.getElementById("resultLinkedinNative");
  const synonymsRow = document.getElementById("synonymsRow");
  const synonymsList = document.getElementById("synonymsList");
  const historyPanel = document.getElementById("historyPanel");
  const helpPanel = document.getElementById("helpPanel");
  const feedbackPanel = document.getElementById("feedbackPanel");
  const sidePanelBackdrop = document.getElementById("sidePanelBackdrop");
  const historyList = document.getElementById("historyList");

  const FEEDBACK_EMAILS = { alexis: "alexis.gorino@mindata.es", franco: "franco.velazco@mindata.es" };
  const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/";

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

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Quitar " + term);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        state[field].splice(i, 1);
        renderChips(field);
        if (field === "rol") renderSynonyms();
      });

      chip.appendChild(span);
      chip.appendChild(removeBtn);
      wrap.appendChild(chip);
    });
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
      return;
    }
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

  function addTerm(field, rawValue) {
    const value = rawValue.trim().replace(/,$/, "");
    if (!value) return;
    if (state[field].some((t) => t.toLowerCase() === value.toLowerCase())) return;
    state[field].push(value);
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

  // ---------------------------------------------------------------
  // Network tabs
  // ---------------------------------------------------------------
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
  function runAnalysis() {
    const text = jdInput.value;
    if (!text.trim()) {
      showError("Pegá o subí una JD antes de analizar.", "file");
      return;
    }
    const result = RadarExtractor.analyzeJD(text);
    if (result.isResume) {
      showError("Esto parece un CV (nombre, teléfono y mail al principio), no una descripción de puesto — subí la JD de la vacante, no el currículum de un candidato.", "file");
      return;
    }
    if (!result.isJobPosting) {
      showError("Esto no parece una descripción de puesto — no encontramos rol, ubicación, skills ni palabras típicas de una JD (\"requisitos\", \"responsabilidades\"...). Completá los campos a mano.", "file");
      return;
    }
    FIELDS.forEach((f) => {
      (result[f] || []).forEach((term) => addTerm(f, term));
    });
    if (result.country) {
      countrySelect.value = result.country;
    }
    renderRefinarSuggestions(result.refinarSuggestion || []);
  }
  document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

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
            chain.then((textSoFar) =>
              pdf
                .getPage(pageNum)
                .then((page) => page.getTextContent())
                .then((content) => textSoFar + content.items.map((item) => item.str).join(" ") + "\n")
            ),
          Promise.resolve("")
        );
    });
  }

  function loadTextFile(file) {
    if (!file) return;
    const isTxt = file.type === "text/plain" || /\.txt$/i.test(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    if (!isTxt && !isPdf) {
      showError("Solo se aceptan archivos .txt o .pdf por ahora. Copiá y pegá el texto si viene de Word.", "file");
      return;
    }

    if (isTxt) {
      if (file.size > MAX_TXT_BYTES) {
        showError("El archivo pesa más de 500 KB. Pegá el texto directamente en el cuadro.", "file");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        jdInput.value = String(reader.result || "").slice(0, 20000);
        runAnalysis();
      };
      reader.onerror = () => showError("No se pudo leer el archivo.", "file");
      reader.readAsText(file);
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
      extractPdfText(reader.result)
        .then((text) => {
          const trimmed = text.trim();
          if (!trimmed) {
            showError("No se pudo extraer texto de ese PDF (¿es un escaneo/imagen?). Pegalo a mano.", "file");
            return;
          }
          jdInput.value = trimmed.slice(0, 20000);
          showError("", "file");
          runAnalysis();
        })
        .catch(() => showError("No se pudo leer ese PDF. Puede estar dañado o protegido.", "file"));
    };
    reader.onerror = () => showError("No se pudo leer el archivo.", "file");
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

  // Renders the universal boolean + whatever the selected network needs.
  // Split out from the button handler so the "Relajar búsqueda" checkbox
  // can re-render live without re-adding a history entry every toggle.
  function renderResults() {
    const relaxed = relaxedModeCheckbox.checked;
    const universal = RadarGenerator.buildUniversalBoolean(state, relaxed);
    document.getElementById("out-universal").textContent = universal;

    const net = RadarNetworks.NETWORKS[selectedNetwork];

    resultLinkedinNative.classList.toggle("hidden", selectedNetwork !== "linkedin");
    if (selectedNetwork === "linkedin") {
      const tiers = RadarGenerator.buildLinkedinBooleanTiers(state);
      document.getElementById("out-linkedin").textContent = tiers[0] ? tiers[0].query : "—";
      const tiersWrap = document.getElementById("linkedinTiers");
      tiersWrap.innerHTML = "";
      tiers.forEach((tier, i) => {
        const a = document.createElement("a");
        a.className = "btn btn-engine" + (i === 0 ? " btn-engine-primary" : "");
        a.href = RadarGenerator.linkedinSearchUrl(tier.query);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = tiers.length > 1 ? `Buscar en LinkedIn — ${tier.label}` : "Buscar en LinkedIn";
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
      } else {
        const siteDomain = selectedNetwork === "custom" ? customSiteInput.value.trim().replace(/^https?:\/\//, "") : net.site;
        xrayQuery = RadarGenerator.buildXRayQuery(state, siteDomain, relaxed, net.looseRol);
        label = "X-Ray — " + net.label;
      }
      document.getElementById("out-xray").textContent = xrayQuery;
      document.getElementById("xrayNetworkLabel").textContent = label;
      document.getElementById("openGoogle").href = RadarGenerator.googleUrl(xrayQuery);
      document.getElementById("openBing").href = RadarGenerator.bingUrl(xrayQuery);
      document.getElementById("xrayNote").textContent = NOTES[selectedNetwork] || "";
    }

    resultsEl.classList.add("show");
    return universal;
  }

  document.getElementById("generateBtn").addEventListener("click", () => {
    if (!state.rol.length) {
      showError("Completá al menos el campo Rol antes de generar.");
      return;
    }
    const universal = renderResults();
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    saveToHistory(universal);
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
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = "Copiado";
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
    jdInput.value = "";
    countrySelect.value = "";
    customSiteInput.value = "";
    minStarsInput.value = "";
    relaxedModeCheckbox.checked = false;
    selectNetwork("linkedin");
    resultsEl.classList.remove("show");
    Object.values(errorSlots).forEach((el) => (el.textContent = ""));
    renderRefinarSuggestions([]);
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
      dominio: state.dominio.slice(),
      alcance: state.alcance.slice(),
      refinar: state.refinar.slice(),
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
    FIELDS.forEach((f) => {
      state[f] = (entry[f] || []).slice();
    });
    renderAllChips();
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
  const ALL_SIDE_PANELS = [historyPanel, helpPanel, feedbackPanel];
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
  sidePanelBackdrop.addEventListener("click", closeSidePanels);

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
