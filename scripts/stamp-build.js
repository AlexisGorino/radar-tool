const fs = require('node:fs');
const path = require('node:path');

const outputIndex = path.resolve(process.argv[2] || path.join(__dirname, '../dist/radar-tool/browser/index.html'));
if (!fs.existsSync(outputIndex)) {
  throw new Error(`Angular build output not found: ${outputIndex}`);
}

const buildId = (process.env.GITHUB_SHA || `local-${Date.now().toString(36)}`).slice(0, 12);
const html = fs.readFileSync(outputIndex, 'utf8');
const stamped = html.replace(/(<meta\s+name="radar-build-id"\s+content=")[^"]*("\s*\/?\s*>)/, `$1${buildId}$2`);

if (stamped === html) {
  throw new Error('Could not find the radar-build-id meta tag in the Angular build output.');
}

fs.writeFileSync(outputIndex, stamped);
process.stdout.write(`Stamped RADAR build ${buildId}\n`);
