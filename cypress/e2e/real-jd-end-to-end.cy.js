// Uses a real recruiter-submitted JD (INDRA - Arquitecto Cloud) to verify the
// FULL guided path — upload, extraction, review, confirm, search, and that
// returned profiles actually render — in one pass. This is the end-to-end
// check that matters: no step here is allowed to leave the recruiter stuck.
describe("Real JD end-to-end: upload to a visible profile shortlist", () => {
  it("takes the real Arquitecto Cloud JD from upload to a rendered public-profile shortlist", () => {
    cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
    cy.intercept("POST", "**/api/analyze", { statusCode: 503, body: { error: "ai_unavailable" } });
    let searchBody = null;
    cy.intercept("POST", "/mock-search", (request) => {
      searchBody = request.body;
      request.reply({
        statusCode: 200,
        body: {
          count: 2,
          sourceErrors: [],
          results: [
            { source: "linkedin", url: "https://linkedin.com/in/ana-arquitecta-cloud", title: "Ana Torres - Arquitecta Cloud AWS - LinkedIn", snippet: "Terraform, AWS, Azure. Barcelona, España.", position: 1 },
            { source: "linkedin", url: "https://linkedin.com/in/luis-cloud-architect", title: "Luis Gómez - Cloud Architect - LinkedIn", snippet: "AWS Certified Solutions Architect. Barcelona, España.", position: 2 },
          ],
        },
      });
    }).as("realSearch");

    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        win.localStorage.setItem("radar-tour-seen-v1", "1");
      },
    });
    cy.get("#appShell").should("be.visible");
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");

    // 1) Upload the real file — no manual retyping.
    cy.get("#fileInput").selectFile("cypress/fixtures/jd-arquitecto-cloud.pdf", { force: true });
    cy.get("#jdInput").should("contain.value", "ARQUITECTO CLOUD");
    cy.get("#analyzeBtn").click();
    cy.get("#jdReview").should("be.visible");

    // The extraction bug fixed today must not resurface: no dangling "un/una"
    // fragments or generic nouns ("iniciativas") shown as an extracted term
    // (the quoted evidence snippet below each chip is normal prose context,
    // not a term, and legitimately contains ordinary words like "un").
    cy.get(".synonyms-list button, .jd-review-grid button").should(($buttons) => {
      const terms = [...$buttons].map((btn) => btn.textContent.replace(/^\+\s*/, "").trim());
      expect(terms, "extracted terms").to.not.include.members(["un seguimiento continuo", "iniciativas"]);
    });
    cy.get("#jdReviewGrid").should("contain.text", "AWS").and("contain.text", "Azure").and("contain.text", "Terraform");

    // 2) Walk the review questions however many appear, always taking the
    // "keep going" option, same as a recruiter clicking through once.
    const clickIfPresent = (text) => {
      cy.get("body").then(($body) => {
        if ($body.find(`#jdReviewQuestions button:contains("${text}")`).length) {
          cy.contains("#jdReviewQuestions button", text).click({ force: true });
        }
      });
    };
    clickIfPresent("Sí, es este perfil");
    clickIfPresent("Sí, usar estas señales");
    clickIfPresent("Sí, limitar a esta ubicación");
    // Any remaining per-signal question: keep the signal as non-restrictive.
    // Click one at a time and re-check, since each click re-renders the list.
    for (let i = 0; i < 5; i++) clickIfPresent("Solo suma");

    cy.get("#applyJdBtn").click();
    cy.get("#chips-rol").should("contain.text", "ARQUITECTO CLOUD");
    cy.get("#chips-alcance").should("contain.text", "Barcelona");
    cy.get("#countrySelect").should("have.value", "España");

    // 3) Generate and run the automated search with real-shaped criteria.
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.wait("@realSearch").then(() => {
      expect(searchBody.location).to.include("España");
      expect(searchBody.queries[0].query.toLowerCase()).to.include("cloud");
    });

    // 4) The part the recruiter actually needs to see: profiles on screen.
    cy.get(".public-profile-card").should("have.length", 2);
    cy.get(".public-profile-card").eq(0).should("contain.text", "Ana Torres");
    cy.get(".public-profile-card").eq(1).should("contain.text", "Luis Gómez");
    cy.get("#publicSearchStatus").should("contain.text", "perfil");
  });
});
