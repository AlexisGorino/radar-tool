function primeAuthenticatedSession(win) {
  win.localStorage.setItem("radar-auth-v1", "ok");
  win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
}

describe("PDF job description upload", () => {
  beforeEach(() => {
    cy.intercept("POST", "**/api/analyze", {
      statusCode: 503,
      body: { error: "ai_unavailable" },
    }).as("profileAnalysis");
    cy.visit("/", {
      onBeforeLoad(win) {
        primeAuthenticatedSession(win);
      },
    });
    cy.get("#appShell").should("be.visible");
  });

  it("selects a PDF, extracts its text in the browser and opens the review", () => {
    cy.fixture("sample-jd.pdf", "base64").then((pdf) => {
      cy.get("#fileInput").selectFile({
        contents: Cypress.Buffer.from(pdf, "base64"),
        fileName: "backend-developer.pdf",
        mimeType: "application/pdf",
        lastModified: Date.now(),
      }, { force: true });
    });

    cy.get("#fileNameDisplay").should("contain.text", "backend-developer.pdf");
    cy.get("#jdInput").should("contain.value", "Senior Backend Developer");
    cy.get("#jdInput").should("contain.value", "Python AWS");
    cy.get("#pdfReviewDialog").then(($dialog) => {
      if ($dialog[0].open) cy.get("#confirmPdfReviewBtn").click();
    });
    cy.get("#jdReview").should("be.visible");
    cy.get(".inline-error").should("not.exist");
  });

  it("pauses a doubtful PDF for confirmation before sending its text for analysis", () => {
    cy.fixture("unrelated-document.pdf", "base64").then((pdf) => {
      cy.get("#fileInput").selectFile({
        contents: Cypress.Buffer.from(pdf, "base64"),
        fileName: "informe.pdf",
        mimeType: "application/pdf",
        lastModified: Date.now(),
      }, { force: true });
    });
    cy.get("#pdfReviewDialog").should("be.visible");
    cy.get("#pdfReviewMessage").should("contain.text", "Compará el texto con el archivo original");
    cy.get("#pdfReviewExcerpt").should("contain.text", "resultados comerciales");
    cy.get("@profileAnalysis.all").should("have.length", 0);
    cy.get("#confirmPdfReviewBtn").click();
    cy.get("#jdReview").should("be.visible");
    cy.get("#jdReviewSummary").should("be.visible");
  });

  it("reports a clear error for a damaged PDF instead of leaving the upload stuck", () => {
    cy.get("#fileInput").selectFile({
      contents: Cypress.Buffer.from("This is not a PDF", "utf8"),
      fileName: "damaged.pdf",
      mimeType: "application/pdf",
      lastModified: Date.now(),
    }, { force: true });

    cy.get(".inline-error", { timeout: 10000 })
      .should("be.visible")
      .and("contain.text", "No se pudo leer ese PDF");
  });

  it("shows OCR progress and lets you cancel without leaving the upload stuck", () => {
    cy.fixture("sample-scanned-jd.pdf", "base64").then((pdf) => {
      cy.get("#fileInput").selectFile({
        contents: Cypress.Buffer.from(pdf, "base64"),
        fileName: "sample-scanned-jd.pdf",
        mimeType: "application/pdf",
        lastModified: Date.now(),
      }, { force: true });
    });

    cy.get("#cancelOcrBtn", { timeout: 30000 }).should("be.visible");
    cy.get("#fileNameDisplay").invoke("text").should("match", /%|página/);
    cy.get("#cancelOcrBtn").click();
    cy.get("#cancelOcrBtn").should("have.class", "hidden");
    cy.get(".inline-status").should("contain.text", "Lectura cancelada");
  });

  it("recognizes a scanned job-description PDF locally", function () {
    this.timeout(90000);
    cy.fixture("sample-scanned-jd.pdf", "base64").then((pdf) => {
      cy.get("#fileInput").selectFile({
        contents: Cypress.Buffer.from(pdf, "base64"),
        fileName: "sample-scanned-jd.pdf",
        mimeType: "application/pdf",
        lastModified: Date.now(),
      }, { force: true });
    });

    cy.get("#jdInput", { timeout: 80000 }).should(($input) => {
      expect($input.val().trim().length, "locally recognized PDF text").to.be.greaterThan(100);
    });
    cy.get("#pdfReviewDialog").then(($dialog) => {
      if ($dialog[0].open) cy.get("#confirmPdfReviewBtn").click();
    });
    cy.get("#jdReview", { timeout: 80000 }).should("be.visible");
    cy.get(".inline-error").should("not.exist");
  });
});
