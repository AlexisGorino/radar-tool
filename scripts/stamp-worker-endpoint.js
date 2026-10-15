const fs = require("node:fs");
const path = require("node:path");

const outputIndex = path.resolve(process.argv[2] || path.join(__dirname, "../dist/radar-tool/browser/index.html"));
if (!fs.existsSync(outputIndex)) {
  throw new Error(`Worker build output not found: ${outputIndex}`);
}

const html = fs.readFileSync(outputIndex, "utf8");
const stamped = html.replace(
  /(<meta\s+name="radar-search-endpoint"\s+content=")[^"]*("\s*\/?\s*>)/i,
  "$1/api/search$2",
);

if (stamped === html) {
  throw new Error("Could not find radar-search-endpoint meta tag in the built document.");
}

fs.writeFileSync(outputIndex, stamped);
process.stdout.write("Configured RADAR to use the same-origin Cloudflare Worker API\n");
