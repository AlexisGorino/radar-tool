/**
 * app.js
 * Wires the DOM to the pure engine (extractor.js + generator.js).
 * Rendering rule followed throughout: user-provided text only ever goes
 * into the page through .textContent, never .innerHTML — this is the one
 * XSS-relevant rule for a static, no-backend tool like this one.
 */
(function () {
  "use strict";

  const FIELDS = ["rol", "atributos", "dominio", "alcance", "refinar"];
  const MAX_FILE_BYTES = 500 * 1024; // 500 KB is generous for a plain-text JD

  const state = { rol: [], atributos: [], dominio: [], alcance: [], refinar: [] };
  let selectedNetwork = "linkedin";

  const NOTES = {
    linkedin: "OR y comillas funcionan en la cuenta free; el NOT es más confiable en Recruiter / Recruiter Lite.",
    stackoverflow: "Útil para perfiles técnicos con actividad pública en preguntas y respuestas.",
    xing: "Red fuerte en Alemania, Austria y Suiza. Poco uso en LATAM.",
    twitter: "Sirve para roles con presencia pública: devrel, marketing técnico, comunidad.",
    wellfound: "Orientado a startups. Buen lugar para roles de producto y early-stage engineering.",
    indeed: "Busca CVs públicos cargados en Indeed. Cobertura variable según país.",
    behance: "Portfolios públicos. Ideal para roles de diseño, UX/UI e ilustración.",
    resumes: "Busca archivos PDF/Word sueltos en toda la web, sin restringir a un sitio. Trae currículums publicados fuera de las redes profesionales.",
    custom: "Ajustá el dominio arriba. La sintaxis site: funciona igual en cualquier sitio indexado por Google.",
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
  const customSiteRow = document.getElementById("customSiteRow");
  const customSiteInput = document.getElementById("customSiteInput");
  const githubModeRow = document.getElementById("githubModeRow");
  const starsInputWrap = document.getElementById("starsInputWrap");
  const minStarsInput = document.getElementById("minStars");
  const resultsEl = document.getElementById("results");
  const resultXray = document.getElementById("resultXray");
  const resultGithub = document.getElementById("resultGithub");
  const synonymsRow = document.getElementById("synonymsRow");
  const synonymsList = document.getElementById("synonymsList");
  const historyPanel = document.getElementById("historyPanel");
  const helpPanel = document.getElementById("helpPanel");
  const sidePanelBackdrop = document.getElementById("sidePanelBackdrop");
  const historyList = document.getElementById("historyList");

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
      span.textContent = term; // safe: text node, never parsed as markup

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
      btn.textContent = "+ " + syn; // static concatenation with user-independent data, still via textContent
      btn.addEventListener("click", () => {
        addTerm("rol", syn);
      });
      synonymsList.appendChild(btn);
    });
  }

  function addTerm(field, rawValue) {
    const value = rawValue.trim().replace(/,$/, "");
    if (!value) return;
    if (state[field].some((t) => t.toLowerCase() === value.toLowerCase())) return; // no dupes
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
      btn.textContent = net.label; // static, trusted labels — fine as textContent regardless
      btn.addEventListener("click", () => selectNetwork(id));
      networkTabsEl.appendChild(btn);
    });
  }

  function selectNetwork(id) {
    selectedNetwork = id;
    renderNetworkTabs();
    customSiteRow.classList.toggle("hidden", id !== "custom");
    githubModeRow.classList.toggle("hidden", id !== "github");
  }
  renderNetworkTabs();

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
    const result = RadarExtractor.analyzeJD(text);
    FIELDS.forEach((f) => {
      (result[f] || []).forEach((term) => addTerm(f, term));
    });
    if (result.country) {
      countrySelect.value = result.country;
    }
  }
  document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);

  // ---------------------------------------------------------------
  // File upload + drag & drop (plain text only, size-capped)
  // ---------------------------------------------------------------
  function loadTextFile(file) {
    if (!file) return;
    const isTxt = file.type === "text/plain" || /\.txt$/i.test(file.name);
    if (!isTxt) {
      showError("Solo se aceptan archivos .txt por ahora. Copiá y pegá el texto si viene de Word o PDF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError("El archivo pesa más de 500 KB. Pegá el texto directamente en el cuadro.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      jdInput.value = String(reader.result || "").slice(0, 20000);
      runAnalysis();
    };
    reader.onerror = () => showError("No se pudo leer el archivo.");
    reader.readAsText(file);
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
  let errorEl = null;
  function showError(msg) {
    if (!errorEl) {
      errorEl = document.createElement("div");
      errorEl.style.color = "#F11423";
      errorEl.style.fontSize = "12.5px";
      errorEl.style.marginTop = "10px";
      errorEl.style.fontWeight = "700";
      document.getElementById("generateBtn").insertAdjacentElement("afterend", errorEl);
    }
    errorEl.textContent = msg;
    setTimeout(() => {
      if (errorEl) errorEl.textContent = "";
    }, 4000);
  }

  // ---------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------
  document.getElementById("generateBtn").addEventListener("click", () => {
    if (!state.rol.length) {
      showError("Completá al menos el campo Rol antes de generar.");
      return;
    }

    const universal = RadarGenerator.buildUniversalBoolean(state);
    document.getElementById("out-universal").textContent = universal;

    const net = RadarNetworks.NETWORKS[selectedNetwork];

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
        xrayQuery = RadarGenerator.buildResumesQuery(state);
        label = "Búsqueda — " + net.label;
      } else {
        const siteDomain = selectedNetwork === "custom" ? customSiteInput.value.trim().replace(/^https?:\/\//, "") : net.site;
        xrayQuery = RadarGenerator.buildXRayQuery(state, siteDomain);
        label = "X-Ray — " + net.label;
      }
      document.getElementById("out-xray").textContent = xrayQuery;
      document.getElementById("xrayNetworkLabel").textContent = label;
      document.getElementById("openGoogle").href = RadarGenerator.googleUrl(xrayQuery);
      document.getElementById("openBing").href = RadarGenerator.bingUrl(xrayQuery);
      document.getElementById("xrayNote").textContent = NOTES[selectedNetwork] || "";
    }

    resultsEl.classList.add("show");
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    saveToHistory(universal);
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
    selectNetwork("linkedin");
    resultsEl.classList.remove("show");
    if (errorEl) errorEl.textContent = "";
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
      // localStorage unavailable (private mode / quota) — fail silently, history is a convenience
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
  // Side panels (history / help)
  // ---------------------------------------------------------------
  function closeSidePanels() {
    historyPanel.classList.add("hidden");
    helpPanel.classList.add("hidden");
    sidePanelBackdrop.classList.add("hidden");
  }

  function openSidePanel(panel) {
    closeSidePanels();
    panel.classList.remove("hidden");
    sidePanelBackdrop.classList.remove("hidden");
  }

  document.getElementById("historyToggleBtn").addEventListener("click", () => {
    renderHistory();
    openSidePanel(historyPanel);
  });
  document.getElementById("helpBtn").addEventListener("click", () => openSidePanel(helpPanel));
  document.getElementById("closeHistoryBtn").addEventListener("click", closeSidePanels);
  document.getElementById("closeHelpBtn").addEventListener("click", closeSidePanels);
  sidePanelBackdrop.addEventListener("click", closeSidePanels);
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
