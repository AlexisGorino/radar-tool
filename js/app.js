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
  const authGateNombre = document.getElementById("authGateNombre");
  const authGateApellido = document.getElementById("authGateApellido");
  const authGatePassword = document.getElementById("authGatePassword");
  const authGateError = document.getElementById("authGateError");

  authGateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!authGateNombre.value.trim() || !authGateApellido.value.trim()) {
      authGateError.textContent = "Completá tu nombre y apellido antes de entrar.";
      return;
    }
    if (authGatePassword.value !== AUTH_PASSWORD) {
      authGateError.textContent = "Contraseña incorrecta.";
      authGatePassword.value = "";
      authGatePassword.focus();
      return;
    }
    try {
      localStorage.setItem(AUTH_KEY, "ok");
    } catch (err) {
      // private browsing / storage disabled — still unlocks this load,
      // just won't be remembered next time
    }
    RadarTracking.setUser(authGateNombre.value, authGateApellido.value);
    RadarTracking.logEvent("check_in");
    document.documentElement.classList.add("authed");
    authGateError.textContent = "";
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
      "Usá un sitio que publique perfiles o portfolios de personas. Muchos portales de empleo muestran ofertas en Google y reservan sus bases de candidatos a reclutadores con acceso propio; comprobá qué tipo de resultado devuelve el dominio.",
  };

  const NOTES = {
    linkedin: "Este X-Ray es el respaldo — para buscar de verdad usá el botón de arriba, no depende de Google ni Bing.",
    stackoverflow: "El puesto se busca suelto, no entre comillas — en Stack Overflow nadie escribe su cargo tal cual.",
    xing: "Fuerte en Alemania, Austria y Suiza. El país va en inglés para que matchee con el perfil real.",
    behance: "Portfolios públicos de diseño, UX/UI e ilustración. Fuera de ese rubro no trae nada.",
    resumes: "Busca PDF/Word sueltos en toda la web, currículums publicados fuera de las redes profesionales.",
    custom: "El dominio solo acota páginas indexadas. Confirmá que sean perfiles de personas y no anuncios de vacantes.",
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
  let currentFileName = "";
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
  function renderNetworkRecommendations() {
    const container = document.getElementById("networkRecommendations");
    container.textContent = "";
    if (!state.rol.length && !state.atributos.length) return;
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
      return list;
    }
    items.forEach((term) => {
      const item = document.createElement("li");
      const value = document.createElement("button");
      if (fieldName) {
        value.type = "button";
        value.className = "jd-review-term";
        value.textContent = (promotable ? "+ Usar: " : "× Quitar: ") + term;
        value.title = promotable ? "Agregar a los filtros requeridos" : "Quitar este término de los filtros";
        value.addEventListener("click", () => {
          if (promotable) {
            result.atributos = [...(result.atributos || []), term];
            result.atributosDeseables = (result.atributosDeseables || []).filter((entry) => entry !== term);
          } else {
            result[fieldName] = (result[fieldName] || []).filter((entry) => entry !== term);
          }
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
    const accepted = result.reviewAccepted || {};
    return [
      !accepted.role ? "role" : null,
      !result.atributos.length && !accepted.requirements ? "requirements" : null,
      !result.alcance.length && !accepted.location ? "location" : null,
    ].filter(Boolean);
  }

  function renderReviewQuestions(result) {
    const container = document.getElementById("jdReviewQuestions");
    container.textContent = "";
    const gaps = reviewGaps(result);
    const descriptions = {
      role: result.rol.length
        ? [`¿Se trata de ${result.rol[0]}?`, "Confirmá el cargo, corregilo arriba o elegí una búsqueda por requisitos sin título."]
        : ["No encontramos un cargo confiable.", "Podés escribir el cargo arriba o buscar solo por requisitos."],
      requirements: ["No encontramos requisitos específicos.", "Agregá una herramienta, certificación o experiencia clave, o confirmá que querés continuar así."],
      location: [result.fileCountrySuggestion ? `El archivo dice ${result.fileCountrySuggestion}; el texto de la JD no lo confirma.` : "La JD no indica ubicación.", "Agregá una ubicación arriba o confirmá que querés buscar sin ese filtro."],
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
          result.reviewAccepted = { ...(result.reviewAccepted || {}), role: true };
          renderReviewQuestions(result);
        });
        row.appendChild(confirmRole);
      }
      if (gap === "location" && result.fileCountrySuggestion) {
        const useCountry = document.createElement("button");
        useCountry.type = "button";
        useCountry.className = "jd-review-choice";
        useCountry.textContent = `Confirmar ${result.fileCountrySuggestion}`;
        useCountry.addEventListener("click", () => {
          result.country = result.fileCountrySuggestion;
          result.alcance = [result.fileCountrySuggestion];
          if (result.quality && Array.isArray(result.quality.warnings)) {
            result.quality.warnings = result.quality.warnings.filter((warning) =>
              !warning.startsWith("No detectamos una ubicación") && !warning.startsWith("El nombre del archivo menciona")
            );
          }
          renderJdReview(result);
        });
        row.appendChild(useCountry);
      }
      const proceed = document.createElement("button");
      proceed.type = "button";
      proceed.className = "jd-review-choice";
      proceed.textContent = { role: "Buscar sin título", requirements: "Continuar sin requisitos", location: "Buscar sin ubicación" }[gap];
      proceed.addEventListener("click", () => {
        if (gap === "role") result.rol = [];
        result.reviewAccepted = { ...(result.reviewAccepted || {}), [gap]: true };
        if (gap === "role") renderJdReview(result);
        else renderReviewQuestions(result);
      });
      row.appendChild(proceed);
      container.appendChild(row);
    });
    const hasSearchAnchor = result.rol.length || result.atributos.length;
    const apply = document.getElementById("applyJdBtn");
    apply.disabled = !result.isJobPosting || result.isResume || gaps.length > 0 || !hasSearchAnchor;
    if (!hasSearchAnchor && result.isJobPosting) {
      const message = document.createElement("p");
      message.className = "jd-review-warning";
      message.textContent = "Para generar una búsqueda útil, agregá al menos un cargo o un requisito específico.";
      container.appendChild(message);
    }
  }

  function renderJdReview(result) {
    pendingAnalysis = result;
    const quality = result.quality || { level: "Revisar", warnings: [], evidence: {} };
    jdReviewBadge.textContent = quality.level;
    jdReviewBadge.className = "jd-review-badge" + (quality.level === "Buena señal" ? " is-good" : " is-warn");
    jdReviewSummary.textContent = result.isResume
      ? "El documento parece un CV. No lo vamos a aplicar a los campos de búsqueda."
      : result.isJobPosting
        ? `Detectamos ${quality.wordCount || 0} palabras. Revisá título, requisitos y ubicación antes de continuar.`
        : "No pudimos confirmar que el texto sea una descripción de puesto. Revisá la extracción o usá Gemini para una segunda lectura.";

    jdReviewGrid.textContent = "";
    const fields = [
      ["Rol", result.rol, result.rol[0] && quality.evidence && quality.evidence.rol ? [{ term: result.rol[0], text: quality.evidence.rol }] : []],
      ["Atributos detectados", result.atributos, quality.evidence && quality.evidence.atributos, "atributos"],
      ["Deseables / baja prioridad (elegí si deben filtrar)", result.atributosDeseables || result.preferredAttributes, quality.evidence && (quality.evidence.atributosDeseables || quality.evidence.preferredAttributes), "atributosDeseables", true],
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
          result.reviewAccepted = { ...(result.reviewAccepted || {}), role: true };
          pendingAnalysis = result;
          renderReviewQuestions(result);
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

    const warnings = quality.warnings || [];
    jdReviewWarning.textContent = warnings.join(" ");
    jdReviewWarning.classList.toggle("hidden", warnings.length === 0 && result.isJobPosting);
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
    if (!pendingAnalysis || !pendingAnalysis.isJobPosting || pendingAnalysis.isResume || reviewGaps(pendingAnalysis).length || (!pendingAnalysis.rol.length && !pendingAnalysis.atributos.length)) return;
    FIELDS.forEach((field) => {
      state[field] = (pendingAnalysis[field] || []).slice();
    });
    renderAllChips();
    countrySelect.value = pendingAnalysis.country || RadarCountries.detectCountry(pendingAnalysis.alcance.join(" ")) || "";
    renderRefinarSuggestions(pendingAnalysis.refinarSuggestion || []);
    resultsEl.classList.remove("show");
    jdReview.classList.add("hidden");
    pendingAnalysis = null;
    document.getElementById("chips-rol").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function runAnalysis(fileName) {
    const text = jdInput.value;
    if (!text.trim()) {
      showError("Pegá o subí una JD antes de analizar.", "file");
      return;
    }
    const result = RadarExtractor.analyzeJD(text, { fileName: typeof fileName === "string" ? fileName : currentFileName });
    renderJdReview(result);
  }
  jdInput.addEventListener("input", () => {
    currentFileName = "";
    pendingAnalysis = null;
    jdReview.classList.add("hidden");
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
            chain.then((textSoFar) =>
              pdf
                .getPage(pageNum)
                .then((page) => page.getTextContent())
                .then((content) => textSoFar + RadarPdfText.extractTextItems(content.items) + "\n")
            ),
          Promise.resolve("")
        );
    });
  }

  function loadTextFile(file) {
    if (!file) return;
    currentFileName = file.name;
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
        runAnalysis(file.name);
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
          runAnalysis(file.name);
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
    const truncated = RadarGenerator.getTruncatedFields(state);
    generatorWarning.textContent = truncated.length
      ? "Esta red admite hasta 6 términos por grupo. La búsqueda recortó términos de: " + truncated.join(", ") + ". Quitá los menos importantes o generá una estrategia más amplia."
      : "";
    generatorWarning.classList.toggle("hidden", truncated.length === 0);

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
    return universal;
  }

  document.getElementById("generateBtn").addEventListener("click", () => {
    if (selectedNetwork === "custom" && !customSiteInput.value.trim()) {
      showError("Indicá el dominio público donde querés buscar perfiles.");
      return;
    }
    if (!state.rol.length && !state.atributos.length && !state.dominio.length && !state.alcance.length) {
      showError("Agregá al menos un criterio de búsqueda: rol, skill, industria o ubicación.");
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
    jdInput.value = "";
    currentFileName = "";
    pendingAnalysis = null;
    jdReview.classList.add("hidden");
    countrySelect.value = "";
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
