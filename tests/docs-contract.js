const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "backend/worker.mjs"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const backendReadme = fs.readFileSync(path.join(root, "backend/README.md"), "utf8");
const testing = fs.readFileSync(path.join(root, "TESTING.md"), "utf8");

const maxResults = Number(worker.match(/const MAX_RESULTS = (\d+);/)?.[1]);
assert.ok(Number.isInteger(maxResults) && maxResults > 0, "Worker must define a positive result limit");

const sourceBlock = worker.match(/const PUBLIC_SOURCE_IDS = new Set\(\[([^\]]+)\]\)/)?.[1];
assert.ok(sourceBlock, "Worker must define its public shortlist sources");
const sources = [...sourceBlock.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
assert.deepEqual(sources, ["linkedin", "github"], "Update this contract if shortlist sources change");

for (const [label, document] of [["README", readme], ["backend README", backendReadme], ["TESTING", testing]]) {
  assert.ok(document.includes(`hasta ${maxResults}`), `${label} must document the Worker limit of ${maxResults}`);
  for (const source of sources) {
    assert.ok(document.toLowerCase().includes(source), `${label} must mention ${source}`);
  }
}

assert.doesNotMatch(readme, /hasta 50 perfiles|cuatro fuentes públicas/i, "README must not advertise retired shortlist limits");
assert.match(testing, /no se lanzan en CI/i, "Provider searches must remain outside CI to protect quota");

process.stdout.write(`✓ documentation matches ${sources.join(" + ")} shortlist and ${maxResults}-profile cap\n`);
