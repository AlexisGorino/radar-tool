describe("RADAR talent search flow", () => {
  beforeEach(() => {
    // Keep automated QA from writing usage events to the real Mindata sheet.
    cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
      },
    });
    cy.get("#appShell").should("be.visible");
  });

  it("requires review, preserves the Canary Islands scope, and creates no more than three LinkedIn routes", () => {
    cy.get("#jdInput").type(
      "Puesto: Técnico/a instalador/a de telecomunicaciones. Requisitos excluyentes: FTTH y OTDR. Ubicación: Islas Canarias. Excel es deseable.",
      { delay: 0 }
    );
    cy.get("#analyzeBtn").click();
    cy.get("#jdReview").should("be.visible");
    cy.get("#applyJdBtn").should("be.disabled");
    cy.contains("#jdReviewQuestions button", "Sí, es este perfil").click();
    cy.contains("#jdReviewQuestions button", "Sí, usar estas señales").click();
    cy.contains("#jdReviewQuestions button", "Sí, limitar a esta ubicación").click();
    cy.get("#applyJdBtn").should("be.enabled").click();
    cy.get("#generateBtn").click();

    cy.get("#results").should("have.class", "show");
    cy.get("#out-universal").should("contain.text", "FTTH").and("contain.text", "OTDR").and("contain.text", "Canarias");
    cy.get("#out-universal").should("not.contain.text", "España");
    cy.get("#linkedinTiers a").should("have.length.at.most", 3).and("have.length.at.least", 2);
    cy.get("#linkedinTiers a").each(($link) => {
      expect(new URL($link.prop("href")).hostname).to.include("linkedin.com");
    });
  });

  it("boots the search flow on the pinned Angular 21 runtime", () => {
    cy.get("radar-root").should("have.attr", "ng-version", "21.2.25");
    cy.get("#radarBootError").should("not.exist");
    cy.get("#jdReview").should("not.be.visible");
    cy.get("#jdInput").should("be.visible");
    cy.get("html").should("have.attr", "data-radar-ready", "true");
    cy.window().then((win) => {
      const versionedLegacyScripts = win.performance.getEntriesByType("resource").filter((entry) => {
        const url = new URL(entry.name);
        return url.pathname.endsWith("/js/app.js") && url.searchParams.has("v");
      });
      expect(versionedLegacyScripts, "legacy app script has a build-specific cache key").to.have.length(1);
    });
  });

  it("keeps the public-profile search disabled until its server endpoint is configured", () => {
    cy.get("#publicSearchSetup").should("be.visible");
    cy.get("#findProfilesBtn").should("be.disabled");
    cy.get("#publicSearchConfigNote").should("contain.text", "La conexión segura con el proveedor todavía no está configurada");
  });

  it("checks provider readiness without spending a search credit", () => {
    let paidSearchCalls = 0;
    cy.intercept("GET", "/mock-search/health", { statusCode: 200, body: { ready: true, error: null, usesSearchCredit: false } });
    cy.intercept("POST", "/mock-search", () => { paidSearchCalls += 1; });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="imprescindibles"]').type("SQL{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#checkProfilesConnectionBtn").should("be.enabled").click();
    cy.get("#publicSearchStatus").should("contain.text", "esta comprobación no consumió consultas");
    cy.then(() => expect(paidSearchCalls).to.equal(0));
  });

  it("builds a public-profile shortlist, preserves the selected locality, and labels missing evidence", () => {
    cy.intercept("POST", "/mock-search", (request) => {
      expect(request.body.location).to.equal("España, Islas Canarias");
      expect(request.body.queries.map((query) => query.source)).to.include("linkedin");
      request.reply({
        statusCode: 200,
        body: {
          count: 3,
          locationContext: { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" },
          sourceErrors: [{ source: "github", code: "source_unavailable" }],
          results: [
            { source: "linkedin", url: "https://www.linkedin.com/in/ana-perez", title: "Ana Pérez - Telecom Technician - LinkedIn", snippet: "FTTH, OTDR. Islas Canarias, España.", position: 1 },
            { source: "linkedin", url: "https://www.linkedin.com/in/juan-gomez", title: "Juan Gómez - Technician - LinkedIn", snippet: "Telecomunicaciones · España", position: 2 },
            { source: "linkedin", url: "https://www.linkedin.com/jobs/view/123", title: "Oferta laboral - LinkedIn", snippet: "FTTH Islas Canarias", position: 3 },
          ],
        },
      });
    });

    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Técnico instalador{enter}");
    cy.get('[data-field="imprescindibles"]').type("FTTH{enter}");
    cy.get('[data-field="imprescindibles"]').type("OTDR{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Islas Canarias{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="github"]').check();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.get(".public-profile-card").should("have.length", 2);
    cy.get(".public-search-results-heading").should("contain.text", "2 perfiles encontrados");
    cy.get(".public-profile-rank").first().should("have.text", "01");
    cy.get(".public-profile-score").first().should("contain.text", "/100");
    cy.get(".public-profile-details summary").first().click();
    cy.get(".public-profile-details[open]").should("contain.text", "Señales visibles");
    cy.contains("Ana Pérez").should("be.visible");
    cy.contains("Localidad visible").should("be.visible");
    cy.contains("Juan Gómez").parents(".public-profile-card").should("contain.text", "País o región visible; localidad sin confirmar");
    cy.get(".public-profile-card a").each(($link) => {
      expect(new URL($link.prop("href")).hostname).to.equal("www.linkedin.com");
    });
    cy.get("#publicSearchStatus").should("contain.text", "perfiles públicos ordenados por evidencia");
    cy.get("#publicSearchResults").should("contain.text", "Contexto de búsqueda: Canary Islands,Spain");
    cy.get("#publicSearchResults").should("contain.text", "Algunas fuentes no respondieron: GitHub");
  });

  it("suggests a deliberate broader search after no results and keeps hard requirements and locality", () => {
    const sentQueries = [];
    cy.intercept("POST", "/mock-search", (request) => {
      sentQueries.push(request.body.queries[0].query);
      request.reply({ statusCode: 200, body: { count: 0, results: [], sourceErrors: [] } });
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Jefe de Proyecto{enter}");
    cy.get('[data-field="imprescindibles"]').type("MS Project{enter}");
    cy.get('[data-field="atributos"]').type("Jira{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Santiago de Compostela{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get("#publicSearchRefine").should("be.visible").and("contain.text", "Mantiene la localidad, los imprescindibles");
    cy.get("#broadenPublicSearchBtn").click();
    cy.then(() => {
      expect(sentQueries).to.have.length(2);
      expect(sentQueries[0]).to.match(/Jefe de Proyecto/i);
      expect(sentQueries[1]).not.to.match(/Jefe de Proyecto|Project Manager/i);
      expect(sentQueries[1]).to.match(/Santiago de Compostela/i);
      expect(sentQueries[1]).to.match(/MS Project/i);
    });
    cy.get("#publicSearchRefine").should("be.visible").and("contain.text", "quita el cargo literal y el sector");
    cy.get("#broadenPublicSearchBtn").should("contain.text", "Ampliar sin cargo ni sector");
    cy.get("#publicSearchSources").should("contain.text", "Actividad y proyectos públicos");
  });

  it("shows an actionable limit message when the public search provider rate-limits a request", () => {
    cy.intercept("POST", "/mock-search", { statusCode: 429, body: { error: "rate_limited" } });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.get(".public-search-error").should("contain.text", "límite temporal");
    cy.get(".public-search-error").should("contain.text", "No mostramos una lista vacía");
    cy.get("#findProfilesBtn").should("be.enabled");
  });

  it("distinguishes a source failure from a completed search with no matches", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 502,
      body: { error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_timeout" }] },
    }).as("failedPublicSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").click();
    cy.wait("@failedPublicSearch");
    cy.get(".public-search-error").should("contain.text", "tardó demasiado en responder");
    cy.get(".public-search-error").should("contain.text", "No se hacen reintentos automáticos");
    cy.get(".public-search-empty").should("not.exist");
  });

  it("shows a recoverable message when a legacy module fails to load", () => {
    cy.intercept("GET", "**/js/app.js?v=*", { forceNetworkError: true });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
      },
    });
    cy.get("#radarBootError").should("be.visible").and("contain.text", "No pudimos iniciar");
    cy.get("#radarBootRetry").should("be.visible").and("contain.text", "Reintentar");
  });

  it("blocks vague manual searches until role signals and geography are entered", () => {
    cy.get("#generateBtn").click();
    cy.get("#generateBtn + .inline-error").should("contain.text", "Sin título");
    cy.get('[data-field="rol"]').type("Recepcionista{enter}");
    cy.get('[data-field="atributos"]').type("atención al cliente{enter}");
    cy.get('[data-field="dominio"]').type("retail{enter}");
    cy.get('[data-field="alcance"]').type("Rosario{enter}");
    cy.get("#generateBtn").click();
    cy.get("#out-universal").should("contain.text", "Recepcionista").and("contain.text", "atención al cliente").and("contain.text", "Rosario");
    cy.get("#out-universal").should("contain.text", "retail");
    cy.get("#relaxedModeCheckbox").check();
    cy.get("#out-universal").should("contain.text", "Rosario").and("not.contain.text", "retail");
  });

  it("records only anonymous per-source outcome counts in local storage", () => {
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.contains("#outcomePanel button", "Encontré perfiles útiles").click();
    cy.window().then((win) => {
      const saved = JSON.parse(win.localStorage.getItem("radar-outcomes-v1"));
      expect(saved).to.deep.equal({ linkedin: { relevant: 1, noisy: 0, empty: 0 } });
    });
  });

  it("separates required signals, alternatives, and desirables across search routes", () => {
    cy.get('[data-field="rol"]').type("QA Engineer{enter}");
    cy.get('[data-field="atributos"]').type("Selenium{enter}");
    cy.get("#chips-atributos").contains("button", "!").click();
    cy.get("#chips-imprescindibles").should("contain.text", "Selenium");
    cy.get('[data-field="atributos"]').type("Cypress{enter}");
    cy.get('[data-field="deseables"]').type("Playwright{enter}");
    cy.get('[data-field="dominio"]').type("retail{enter}");
    cy.get('[data-field="alcance"]').type("Rosario{enter}");
    cy.get("#generateBtn").click();

    cy.get("#out-universal").should("contain.text", "Selenium").and("contain.text", "Cypress").and("not.contain.text", "Playwright");
    cy.contains("#linkedinTiers a", "2 · Equilibrada").should("contain.text", "deseable");
    cy.get("#linkedinTiers a").eq(1).should(($route) => {
      const query = decodeURIComponent(new URL($route.prop("href")).searchParams.get("keywords"));
      expect(query).to.include("Selenium");
      expect(query).to.include("Playwright");
      expect(query).to.include("Rosario");
    });
    cy.get("#relaxedModeCheckbox").check();
    cy.get("#out-universal").should("contain.text", "Selenium").and("contain.text", "Playwright").and("contain.text", "Rosario").and("not.contain.text", "retail");
  });

  it("routes LinkedIn, GitHub, X-Ray networks, CV search, and custom sites to their intended destinations", () => {
    cy.get('[data-field="rol"]').type("UX Designer{enter}");
    cy.get('[data-field="atributos"]').type("Figma{enter}");
    cy.get('[data-field="atributos"]').type("investigación de usuarios{enter}");
    cy.get('[data-field="dominio"]').type("diseño{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");

    const selectNetwork = (name) => cy.get("#networkTabs button").contains(name).click();
    selectNetwork("LinkedIn");
    cy.get("#generateBtn").click();
    cy.get("#linkedinTiers a").each(($link) => expect(new URL($link.prop("href")).hostname).to.include("linkedin.com"));

    selectNetwork("GitHub");
    cy.get("#generateBtn").click();
    cy.get("#openGithub").should("have.attr", "href").and("include", "github.com/search");

    [["Stack Overflow", "stackoverflow.com/users"], ["Xing", "xing.com/profile"], ["Behance", "behance.net"]].forEach(([name, domain]) => {
      selectNetwork(name);
      cy.get("#generateBtn").click();
      cy.get("#openGoogle").should("have.attr", "href").and("include", encodeURIComponent("site:" + domain));
    });

    selectNetwork("CVs sueltos (PDF/Word)");
    cy.get("#generateBtn").click();
    cy.get("#out-xray").should("contain.text", "filetype:pdf").and("contain.text", "filetype:docx");
    cy.get("#openGoogle").should("have.attr", "href").and("include", "google.com/search");

    selectNetwork("Otro sitio");
    cy.get("#customSiteInput").type("talent.example.org");
    cy.get("#generateBtn").click();
    cy.get("#openGoogle").should("have.attr", "href").and("include", encodeURIComponent("site:talent.example.org"));
  });
});
