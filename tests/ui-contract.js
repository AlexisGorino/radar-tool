const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "src/app/app.component.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const document = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
const appLogic = fs.readFileSync(path.join(root, "js/app.js"), "utf8");

const ids = [...template.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Angular template ids must remain unique");

for (const id of [
  "jdInput", "analyzeBtn", "jdReview", "applyJdBtn", "roleInput", "signalsInput",
  "requiredInput", "countrySelect", "locationInput", "generateBtn", "findProfilesBtn",
  "publicSearchStatus", "publicSearchResults",
]) {
  assert.equal(ids.filter((value) => value === id).length, 1, `Expected one #${id} in the main flow`);
}

for (const id of ["jdInput", "roleInput", "signalsInput", "requiredInput", "countrySelect", "locationInput"]) {
  assert.match(template, new RegExp(`id="${id}"[^>]*(?:aria-label|aria-describedby)=`), `#${id} needs an accessible name or description`);
}

assert.match(document, /<html lang="es">/i, "The app language must be declared for assistive technology");
assert.match(document, /<title>Radar Tool @<\/title>/i, "The browser title should identify the app");
assert.match(template, /id="descriptionModeBtn"[^>]*aria-pressed="true"/, "The job description option must expose its selected state");
assert.match(template, /id="ideaModeBtn"[^>]*aria-pressed="false"/, "The freeform profile option must expose its selected state");
assert.match(template, /id="fileInput"[^>]*aria-label=/, "The file picker needs a clear accessible name");
assert.match(template, /id="fileNameDisplay"[^>]*aria-live="polite"/, "The selected filename must be announced to assistive technology");
assert.match(template, /2 · Revisá qué va a buscar Radar/);
assert.match(template, /Cargar perfil y revisar filtros/);
assert.match(appLogic, /Incluir en conocimientos/);
assert.match(appLogic, /Ver funciones sugeridas y otros datos/);
assert.match(template, /3 · Prepará la búsqueda/);
assert.match(template, /id="jdReview"[^>]*aria-live="polite"/);
assert.match(template, /id="pdfReviewDialog"[^>]*aria-labelledby="pdfReviewTitle"/, "Ambiguous PDF reads need an accessible confirmation dialog");
assert.match(template, /id="publicSearchStatus"[^>]*aria-live="polite"/);
assert.match(styles, /@media\s*\(max-width:\s*680px\)/, "The guided flow needs a small-screen layout");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "Motion must respect the user's accessibility preference");

console.log("UI contract: unique controls, accessible labels, clear steps, status announcements, and responsive/reduced-motion support passed.");
