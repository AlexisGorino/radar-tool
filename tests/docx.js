const assert = require("assert");
const fs = require("fs");
const path = require("path");
const mammoth = require("../js/vendor/mammoth.browser.min.js");
const Extractor = require("../js/extractor.js");
const Review = require("../js/review.js");
const Generator = require("../js/generator.js");

async function main() {
  const buffer = fs.readFileSync(path.join(__dirname, "fixtures", "sample-jd.docx"));
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const document = await mammoth.extractRawText({ arrayBuffer });
  assert.ok(document.value.includes("Auditor de telecomunicaciones"));
  assert.ok(document.value.includes("Ekahau y nPerf"));
  assert.deepStrictEqual(document.messages, []);
  const parsed = Extractor.analyzeJD(document.value, { fileName: "sample-jd.docx", sourceMeta: { docxWarnings: [] } });
  assert.ok(parsed.rol[0].toLowerCase().includes("auditor"));
  assert.ok(parsed.atributos.includes("Ekahau"));
  assert.ok(parsed.atributos.includes("nPerf"));
  assert.ok(parsed.alcance.includes("Madrid"));
  assert.strictEqual(Review.canApply(parsed), false);
  for (const question of Review.pendingQuestions(parsed)) Review.accept(parsed, question);
  assert.strictEqual(Review.canApply(parsed), true);
  assert.ok(Generator.buildUniversalBoolean(parsed).includes("Madrid"));
  console.log("Word .docx: lectura local, análisis y relevamiento OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
