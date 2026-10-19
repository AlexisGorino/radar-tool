const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "src/app/app.component.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const document = fs.readFileSync(path.join(root, "src/index.html"), "utf8");

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
assert.match(template, /2 · Revisá el perfil y el lugar/);
assert.match(template, /3 · Prepará la búsqueda/);
assert.match(template, /id="jdReview"[^>]*aria-live="polite"/);
assert.match(template, /id="publicSearchStatus"[^>]*aria-live="polite"/);
assert.match(styles, /@media\s*\(max-width:\s*680px\)/, "The guided flow needs a small-screen layout");
assert.match(styles, /prefers-reduced-motion:\s*reduce/, "Motion must respect the user's accessibility preference");

console.log("UI contract: unique controls, accessible labels, clear steps, status announcements, and responsive/reduced-motion support passed.");
