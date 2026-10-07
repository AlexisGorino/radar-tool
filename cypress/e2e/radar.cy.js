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
    cy.get("#radarBootError").should("not.be.visible");
    cy.get("#jdReview").should("not.be.visible");
    cy.get("#jdInput").should("be.visible");
    cy.get("html").should("have.attr", "data-radar-ready", "true");
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
