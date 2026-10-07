const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-build-stamp-'));
const targetIndex = path.join(tempDir, 'index.html');

try {
  fs.writeFileSync(targetIndex, '<meta name="radar-build-id" content="dev">');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/stamp-build.js'), targetIndex], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_SHA: '0123456789abcdef' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(targetIndex, 'utf8'), /content="0123456789ab"/);
  process.stdout.write('Build stamp uses the commit identifier.\n');
} finally {
  const resolvedTempDir = path.resolve(tempDir);
  const resolvedTempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolvedTempDir.startsWith(resolvedTempRoot)) throw new Error('Refusing to remove a path outside the temporary directory.');
  fs.rmSync(resolvedTempDir, { recursive: true, force: true });
}
