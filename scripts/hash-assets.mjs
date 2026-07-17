// Cache-busting for the static deploy. Renames css/styles.css and js/main.js
// inside a built `dist/` to include a short content hash, then rewrites the
// references in index.html. main.js.map travels with main.js and its
// sourceMappingURL is updated to match. index.html itself is NOT hashed — it is
// the entry point and stays revalidated, so it hands out the new hashed names.
//
// Only styles.css + main.js are in scope; vendored libs and images are left as
// they are. Run against a dist dir: `node scripts/hash-assets.mjs dist`.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HASH_LEN = 8;

function hashContent(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);
}

function replaceRef(html, from, to) {
  if (!html.includes(from)) {
    throw new Error(`reference not found in index.html: ${from}`);
  }
  return html.split(from).join(to);
}

/**
 * Hash the in-scope assets in `distDir` and rewrite index.html.
 * Returns the list of [originalRelPath, hashedRelPath] renames applied.
 */
export function hashAssets(distDir) {
  const indexPath = join(distDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const renames = [];

  // --- css/styles.css ---
  const cssRel = 'css/styles.css';
  const cssHash = hashContent(readFileSync(join(distDir, cssRel)));
  const cssHashedRel = `css/styles.${cssHash}.css`;
  html = replaceRef(html, cssRel, cssHashedRel);
  renameSync(join(distDir, cssRel), join(distDir, cssHashedRel));
  renames.push([cssRel, cssHashedRel]);

  // --- js/main.js (+ its source map) ---
  const jsRel = 'js/main.js';
  const jsBuf = readFileSync(join(distDir, jsRel));
  const jsHash = hashContent(jsBuf);
  const jsHashedRel = `js/main.${jsHash}.js`;
  html = replaceRef(html, jsRel, jsHashedRel);

  let jsText = jsBuf.toString('utf8');
  const mapRel = 'js/main.js.map';
  if (existsSync(join(distDir, mapRel))) {
    const mapHashedRel = `js/main.${jsHash}.js.map`;
    jsText = jsText.replace('sourceMappingURL=main.js.map', `sourceMappingURL=main.${jsHash}.js.map`);
    renameSync(join(distDir, mapRel), join(distDir, mapHashedRel));
  }
  writeFileSync(join(distDir, jsRel), jsText);
  renameSync(join(distDir, jsRel), join(distDir, jsHashedRel));
  renames.push([jsRel, jsHashedRel]);

  writeFileSync(indexPath, html);
  return renames;
}

// CLI entry: `node scripts/hash-assets.mjs [distDir]`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = process.argv[2] ?? 'dist';
  for (const [from, to] of hashAssets(distDir)) {
    console.log(`hashed ${from} -> ${to}`);
  }
}
