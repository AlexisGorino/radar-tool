// Runs RADAR's dependency-free unit and contract checks in one local command.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const suites = [
  ["Core behavior", "tests/run.js"],
  ["Job description extraction", "tests/jd-bank.js"],
  ["Countries and locations", "tests/locations.js"],
  ["AI integration", "tests/ai.js"],
  ["Usage tracking", "tests/tracking.js"],
  ["Market profile coverage", "tests/market-matrix.js"],
  ["PDF intake", "tests/pdf-text.js"],
  ["JD review quality", "tests/review-quality.js"],
  ["DOCX intake", "tests/docx.js"],
  ["Search outcome feedback", "tests/outcome.js"],
  ["Talent discovery and worker", "tests/talent-discovery.js", "tests/backend-worker.mjs"],
  ["Documentation and UI contracts", "tests/docs-contract.js", "tests/ui-contract.js"],
];

let failures = 0;
for (const [name, ...files] of suites) {
  process.stdout.write(`\n=== ${name} ===\n`);
  for (const file of files) {
    const result = spawnSync(process.execPath, [path.resolve(file)], { stdio: "inherit" });
    if (result.error) {
      process.stderr.write(`${file}: ${result.error.message}\n`);
      failures++;
    } else if (result.status !== 0) {
      process.stderr.write(`${file}: exited with status ${result.status ?? "unknown"}\n`);
      failures++;
    }
  }
}

if (failures) {
  process.stderr.write(`\n${failures} suite(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nAll RADAR unit and contract suites passed.\n");
}
