// Radarcito: mascota de RADAR. Conecta el cerebro (radarcito.js) con la pantalla:
// guía según el paso en que está la persona, recorrido inicial y chat sobre la JD.
// No hace ninguna llamada de red y no guarda texto de la JD; solo recuerda en
// localStorage si ya hizo el recorrido y si silenció los avisos.
(function () {
  "use strict";

  const root = document.getElementById("radarcito");
  if (!root || typeof RadarRadarcito === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const panel = $("radarcitoPanel");
  const launcher = $("radarcitoLauncher");
  const nudge = $("radarcitoNudge");
  const jdInput = $("jdInput");
  const tabs = { guide: $("radarcitoGuideTab"), ask: $("radarcitoAskTab") };
  const panes = { guide: $("radarcitoGuide"), ask: $("radarcitoAsk") };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STORAGE_KEY = "radarcito-v1";
  const WATCHED = ["jdReview", "results", "chips-rol", "chips-atributos", "chips-imprescindibles", "publicSearchResults"];
  const NUDGES = {
    review: "Ya leí la JD. ¿La revisamos juntos?",
    criteria: "Revisá los criterios y seguimos.",
    results: "¡Búsquedas listas! Te cuento cómo seguir.",
    profiles: "¡Llegaron perfiles! Mirá cómo revisarlos.",
  };

  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
    catch { return {}; }
  })();
  const savePrefs = (patch) => {
    Object.assign(prefs, patch);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* Sin almacenamiento, el recorrido se ofrece de nuevo: es aceptable. */ }
  };

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  let stateTimer = null;
  function setState(name, ms) {
    clearTimeout(stateTimer);
    root.dataset.state = name;
    if (ms) stateTimer = setTimeout(() => { root.dataset.state = "idle"; }, ms);
  }

  // ---------- resaltado de controles ----------
  let spotTimer = null;
  function clearSpot() {
    clearTimeout(spotTimer);
    document.querySelectorAll(".radarcito-spot").forEach((node) => node.classList.remove("radarcito-spot"));
  }
  function spot(selector) {
    clearSpot();
    const target = selector && document.querySelector(selector);
    if (!target || target.offsetParent === null) return false;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.classList.add("radarcito-spot");
    spotTimer = setTimeout(clearSpot, 5000);
    return true;
  }

  // ---------- estado del flujo ----------
  const hasChips = () => document.querySelectorAll("#chips-rol .chip, #chips-atributos .chip, #chips-imprescindibles .chip").length;
  const currentStage = () => RadarRadarcito.stage({
    hasText: jdInput.value.trim().length > 0,
    reviewVisible: !$("jdReview").classList.contains("hidden"),
    criteriaCount: hasChips(),
    resultsVisible: $("results").classList.contains("show"),
    profilesVisible: $("publicSearchResults").childElementCount > 0,
  });

  // ---------- panel ----------
  const isOpen = () => !panel.classList.contains("hidden");
  const compact = () => window.matchMedia("(max-width: 680px)").matches;

  function setTab(name, focus) {
    Object.keys(tabs).forEach((key) => {
      const active = key === name;
      tabs[key].setAttribute("aria-selected", String(active));
      tabs[key].tabIndex = active ? 0 : -1;
      panes[key].classList.toggle("hidden", !active);
    });
    if (name === "ask") greetAsk();
    if (focus) tabs[name].focus();
  }

  function openPanel(tab) {
    nudge.classList.add("hidden");
    panel.classList.remove("hidden");
    launcher.setAttribute("aria-expanded", "true");
    setTab(tab || "guide");
    renderGuide();
    panel.focus({ preventScroll: true });
    setState("talking", 1200);
  }

  function closePanel() {
    panel.classList.add("hidden");
    launcher.setAttribute("aria-expanded", "false");
    if (tourIndex >= 0) endTour(false);
    launcher.focus({ preventScroll: true });
  }

  function showNudge(text, ms = 9000, welcome = false) {
    if (isOpen() || prefs.muted) return;
    nudge.textContent = text;
    nudge.dataset.welcome = welcome ? "true" : "false";
    nudge.classList.remove("hidden");
    clearTimeout(showNudge.timer);
    showNudge.timer = setTimeout(() => nudge.classList.add("hidden"), ms);
  }

  // ---------- guía ----------
  let tourIndex = -1;
  const guideMessage = $("radarcitoMessage");
  const guideActions = $("radarcitoActions");
  const tourBox = $("radarcitoTour");

  function button(label, className, onClick) {
    const node = make("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function loadExample() {
    $("descriptionModeBtn")?.click();
    jdInput.value = RadarRadarcito.EXAMPLE_JD;
    jdInput.dispatchEvent(new Event("input", { bubbles: true }));
    refresh();
    spot("#analyzeBtn");
    jdInput.focus({ preventScroll: true });
  }

  function runCta(cta) {
    if (cta.kind === "example") loadExample();
    else if (cta.kind === "focus") { jdInput.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" }); jdInput.focus({ preventScroll: true }); spot(cta.target); }
    else if (cta.kind === "click") { document.querySelector(cta.target)?.click(); }
    else spot(cta.target);
    if (compact()) closePanel();
  }

  function renderGuide() {
    if (tourIndex >= 0) return renderTour();
    tourBox.classList.add("hidden");
    const stage = currentStage();
    guideMessage.replaceChildren(make("p", "", stage.message));
    guideActions.replaceChildren(...stage.ctas.map((cta, index) => button(cta.label, index ? "btn btn-ghost btn-small" : "btn btn-primary btn-small", () => runCta(cta))));
    $("radarcitoTourBtn").classList.remove("hidden");
    $("radarcitoMuteBtn").textContent = prefs.muted ? "Activar avisos de Radarcito" : "Silenciar avisos de Radarcito";
  }

  // ---------- recorrido ----------
  function startTour() {
    tourIndex = 0;
    setTab("guide");
    renderTour();
    if (!isOpen()) openPanel("guide");
  }

  function endTour(finished) {
    tourIndex = -1;
    clearSpot();
    savePrefs({ toured: true });
    if (finished) setState("happy", 1600);
    renderGuide();
  }

  function renderTour() {
    const steps = RadarRadarcito.TOUR;
    const step = steps[tourIndex];
    guideMessage.replaceChildren(make("h3", "radarcito-step-title", step.title), make("p", "", step.text));
    guideActions.replaceChildren();
    $("radarcitoTourBtn").classList.add("hidden");
    tourBox.classList.remove("hidden");
    tourBox.querySelector(".radarcito-dots").replaceChildren(...steps.map((_, index) => make("span", index === tourIndex ? "is-current" : "")));
    $("radarcitoTourCount").textContent = `Paso ${tourIndex + 1} de ${steps.length}`;
    $("radarcitoTourPrev").classList.toggle("hidden", tourIndex === 0);
    $("radarcitoTourNext").textContent = tourIndex === steps.length - 1 ? "¡Listo!" : "Siguiente";
    if (!spot(step.target)) clearSpot();
    setState("talking", 1200);
  }

  $("radarcitoTourPrev").addEventListener("click", () => { tourIndex = Math.max(0, tourIndex - 1); renderTour(); });
  $("radarcitoTourNext").addEventListener("click", () => {
    if (tourIndex >= RadarRadarcito.TOUR.length - 1) { endTour(true); setTab("ask", true); }
    else { tourIndex += 1; renderTour(); }
  });
  $("radarcitoTourSkip").addEventListener("click", () => endTour(false));
  $("radarcitoTourBtn").addEventListener("click", startTour);
  $("radarcitoMuteBtn").addEventListener("click", () => { savePrefs({ muted: !prefs.muted }); nudge.classList.add("hidden"); renderGuide(); });

  // ---------- chat sobre la JD ----------
  const log = $("radarcitoLog");
  const suggestions = $("radarcitoSuggestions");
  const form = $("radarcitoForm");
  const question = $("radarcitoQuestion");
  let analysisCache = { text: null, value: null };
  let greetedWithText = null;

  function analysisFor(text) {
    if (analysisCache.text === text) return analysisCache.value;
    let value = null;
    try { value = typeof RadarExtractor !== "undefined" ? RadarExtractor.analyzeJD(text) : null; } catch { value = null; }
    analysisCache = { text, value };
    return value;
  }

  function addMessage(role, text, extra = {}) {
    const { quotes = [], followUps = [], list = [], aiQuestion = "", source = "", apply = null } = extra;
    const row = make("div", `radarcito-msg radarcito-msg-${role}`);
    text.split(/\n{2,}/).forEach((paragraph) => row.appendChild(make("p", "", paragraph.trim())));
    if (list.length) row.appendChild(make("ul")).append(...list.map((item) => make("li", "", item)));
    quotes.forEach((quote) => row.appendChild(make("blockquote", "", quote)));
    if (source) row.appendChild(make("p", "radarcito-source", source));
    const chips = followUps.map((label) => button(label, "radarcito-chip", () => ask(label)));
    if (aiQuestion) {
      const aiChip = button("Consultar a la IA de RADAR", "radarcito-chip radarcito-chip-ai", () => { aiChip.disabled = true; askAI(aiQuestion); });
      chips.unshift(aiChip);
      row.appendChild(make("p", "radarcito-source", "Se envía solo tu pregunta y el cargo de la JD (sin correos ni teléfonos)."));
    }
    if (apply && apply.terms.length) {
      const applyChip = button(`Agregar a los criterios: ${apply.terms.join(", ")}`, "radarcito-chip radarcito-chip-ai", () => { applyChip.disabled = true; applyTerms(apply); });
      chips.unshift(applyChip);
    }
    if (chips.length) row.appendChild(make("div", "radarcito-chips", "")).append(...chips);
    log.appendChild(row);
    while (log.childElementCount > 40) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  // Carga los términos en el campo real de la pantalla, como si la persona los hubiera tipeado
  // (Enter), así pasan por las mismas validaciones y deduplicación que cualquier otro cambio.
  function applyTerms({ field, terms }) {
    const input = document.querySelector(`.field-input[data-field="${field}"]`);
    if (!input) { addMessage("bot", "No encontré el campo para agregarlos. Podés copiarlos a mano en el paso 2."); return; }
    terms.forEach((term) => {
      input.value = term;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    input.value = "";
    addMessage("bot", "Listo, los agregué como alternativas del cargo. Alcanza con que coincida una; podés quitar las que no quieras.");
    setState("happy", 1500);
    spot(`#chips-${field}`);
    if (compact()) closePanel();
  }

  function askEndpoint() {
    const meta = (document.querySelector('meta[name="radar-search-endpoint"]')?.content || "").trim();
    if (!meta) return "";
    const url = new URL(meta, window.location.href);
    url.pathname = url.pathname.replace(/\/api\/search$/, "/api/ask");
    return url.toString();
  }

  // Lo que no está en la base local se consulta a la IA del Worker, solo si la persona lo pide.
  // Al modelo viaja la pregunta y un resumen mínimo del cargo, nunca el texto completo de la JD.
  async function askAI(questionText) {
    const endpoint = askEndpoint();
    if (!endpoint) { addMessage("bot", "La consulta a la IA no está disponible en este entorno."); return; }
    setState("thinking");
    const source = jdInput.value.trim();
    const analysis = source ? analysisFor(source) : null;
    const context = analysis && (analysis.rol || []).length
      ? `Cargo: ${analysis.rol[0]}. Conocimientos: ${[...(analysis.imprescindibles || []), ...(analysis.atributos || [])].slice(0, 8).join(", ")}.`
      : "";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ question: questionText, context }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "answered" || !payload.answer) throw new Error(payload.error || "ai_unavailable");
      const lines = payload.answer.split("\n").map((line) => line.trim()).filter(Boolean);
      const items = lines.filter((line) => /^[-•*]\s+/.test(line)).map((line) => line.replace(/^[-•*]\s+/, ""));
      const prose = lines.filter((line) => !/^[-•*]\s+/.test(line)).join("\n\n");
      addMessage("bot", prose || "Esto es lo que encontré:", { list: items, source: "Respuesta de la IA de RADAR. Puede equivocarse: verificá los datos importantes." });
      setState("talking", 1400);
    } catch {
      addMessage("bot", "No pude consultar a la IA en este momento. Probá de nuevo en unos minutos o reformulá la pregunta.");
      setState("idle");
    }
  }

  // Solo 4 sugerencias a la vez y sin repetir las ya preguntadas: así la conversación conserva el lugar.
  const asked = new Set();
  function renderSuggestions() {
    const hasText = jdInput.value.trim().length > 0;
    const pool = hasText ? RadarRadarcito.SUGGESTIONS : ["¿Qué hace un data engineer?", "¿Qué es Kubernetes?", "¿Cómo hunteo un contador?", "¿Qué preguntas le hago a un vendedor?"];
    const chips = pool.filter((label) => !asked.has(label)).slice(0, 4).map((label) => button(label, "radarcito-chip", () => ask(label)));
    if (!hasText) chips.unshift(button("Probar con un ejemplo", "radarcito-chip", () => { loadExample(); greetAsk(); }));
    suggestions.replaceChildren(...chips);
  }

  function greetAsk() {
    const text = jdInput.value.trim();
    if (greetedWithText === (text ? "text" : "empty")) return renderSuggestions();
    greetedWithText = text ? "text" : "empty";
    addMessage("bot", text
      ? "Ya leí tu descripción. Preguntame lo que quieras: qué significa un término, qué preguntas hacerle al candidato, cómo hunterearlo o qué conviene aclarar."
      : "Preguntame lo que quieras sobre perfiles y tecnologías de cualquier área, por ejemplo «¿qué hace un data engineer?». Si cargás una JD, también te la explico.");
    renderSuggestions();
  }

  function ask(text) {
    const value = String(text || "").trim().slice(0, 200);
    if (!value) return;
    asked.add(value);
    addMessage("user", value);
    setState("thinking");
    setTimeout(() => {
      const source = jdInput.value;
      const result = RadarRadarcito.answer(value, source, source.trim() ? analysisFor(source) : null);
      addMessage("bot", result.text, { quotes: result.quotes, followUps: result.followUps, list: result.list, apply: result.apply, aiQuestion: result.ask ? value : "" });
      setState("talking", 1400);
    }, reduceMotion ? 0 : 450);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(question.value);
    question.value = "";
    question.focus();
  });

  // ---------- eventos del panel ----------
  launcher.addEventListener("click", () => (isOpen() ? closePanel() : openPanel()));
  $("radarcitoCloseBtn").addEventListener("click", closePanel);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); closePanel(); } });
  Object.keys(tabs).forEach((key) => {
    tabs[key].addEventListener("click", () => setTab(key));
    tabs[key].addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") setTab(key === "guide" ? "ask" : "guide", true);
    });
  });
  nudge.addEventListener("click", () => {
    if (nudge.dataset.welcome === "true") startTour();
    else openPanel();
  });

  // ---------- reacción a lo que pasa en la pantalla ----------
  let lastStage = null;
  const announced = new Set();
  let frame = 0;
  function refresh() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const stage = currentStage();
      if (stage.id !== lastStage) {
        const previous = lastStage;
        lastStage = stage.id;
        if (previous && NUDGES[stage.id]) {
          setState("happy", 1500);
          if (prefs.toured && !announced.has(stage.id)) { announced.add(stage.id); showNudge(NUDGES[stage.id]); }
        }
      }
      if (isOpen() && tourIndex < 0) renderGuide();
      if (!panes.ask.classList.contains("hidden")) renderSuggestions();
    });
  }

  const observer = new MutationObserver(refresh);
  WATCHED.forEach((id) => { const node = $(id); if (node) observer.observe(node, { attributes: true, attributeFilter: ["class"], childList: true }); });
  jdInput.addEventListener("input", refresh);
  refresh();

  // Las pupilas siguen al cursor: un guiño de vida que no cuesta nada.
  if (!reduceMotion) {
    const pupils = root.querySelectorAll(".rc-pupil");
    let moving = 0;
    document.addEventListener("pointermove", (event) => {
      if (moving) return;
      moving = requestAnimationFrame(() => {
        moving = 0;
        const box = launcher.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = 2.8 * Math.min(1, distance / 220);
        pupils.forEach((pupil) => { pupil.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`; });
      });
    }, { passive: true });
  }

  // Primera visita: un saludo discreto una vez que la persona pasó la pantalla de acceso.
  function welcomeWhenReady() {
    if (prefs.toured) return;
    const greet = () => setTimeout(() => showNudge("¡Hola! Soy Radarcito, tu guía. ¿Te muestro cómo se usa?", 15000, true), 1400);
    if (document.documentElement.classList.contains("authed")) return greet();
    const watcher = new MutationObserver(() => {
      if (document.documentElement.classList.contains("authed")) { watcher.disconnect(); greet(); }
    });
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  welcomeWhenReady();
})();
