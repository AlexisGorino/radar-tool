import assert from "node:assert/strict";

const rawUrl = process.argv[2];
assert.ok(rawUrl, "Pass the deployed GitHub Pages URL as the first argument");
const siteUrl = new URL(rawUrl);
assert.equal(siteUrl.protocol, "https:", "The Pages URL must use HTTPS");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastError;
let html;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    const response = await fetch(siteUrl, { headers: { Accept: "text/html" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Page returned HTTP ${response.status}`);
    html = await response.text();
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 6) await pause(3_000);
  }
}

assert.ok(html, `Could not load deployed Pages site: ${lastError?.message || "unknown error"}`);
assert.match(html, /<title>Radar Tool @<\/title>/, "Deployed document title is missing");
const buildId = html.match(/<meta\s+name="radar-build-id"\s+content="([^"]+)"/i)?.[1];
assert.ok(buildId && buildId !== "dev", "Deployed build marker is missing or unstamped");

const assetPaths = [
  ...[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]),
  ...[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)].map((match) => match[1]),
];
assert.ok(assetPaths.some((asset) => /main-[^/]+\.js(?:\?|$)/.test(asset)), "Angular main bundle is missing");
assert.ok(assetPaths.some((asset) => /styles-[^/]+\.css(?:\?|$)/.test(asset)), "Stylesheet bundle is missing");

for (const assetPath of assetPaths) {
  const assetUrl = new URL(assetPath, siteUrl);
  assert.equal(assetUrl.origin, siteUrl.origin, "Unexpected third-party asset in deployed document");
  const response = await fetch(assetUrl, { method: "HEAD", cache: "no-store" });
  assert.ok(response.ok, `Deployed asset failed: ${assetUrl.pathname} (HTTP ${response.status})`);
}

process.stdout.write(`✓ Pages smoke check passed for build ${buildId} (${assetPaths.length} assets)\n`);
