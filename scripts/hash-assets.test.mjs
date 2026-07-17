import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashAssets } from './hash-assets.mjs';

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), 'hash-assets-'));
  mkdirSync(join(dir, 'css'));
  mkdirSync(join(dir, 'js'));
  writeFileSync(join(dir, 'css/styles.css'), '.a{color:red}');
  writeFileSync(join(dir, 'js/main.js'), 'console.log(1);\n//# sourceMappingURL=main.js.map\n');
  writeFileSync(join(dir, 'js/main.js.map'), '{"version":3}');
  writeFileSync(
    join(dir, 'index.html'),
    '<link rel="stylesheet" href="css/styles.css" />\n<script src="js/main.js"></script>\n',
  );
  return dir;
}

test('renames css/js with a content hash and rewrites index.html', () => {
  const dir = makeDist();
  const renames = hashAssets(dir);

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  // original references are gone
  assert.ok(!html.includes('"css/styles.css"'));
  assert.ok(!html.includes('"js/main.js"'));
  // hashed references present, files exist on disk, originals removed
  for (const [from, to] of renames) {
    assert.match(to, /\.[0-9a-f]{8}\./);
    assert.ok(html.includes(to), `html references ${to}`);
    assert.ok(existsSync(join(dir, to)), `${to} exists`);
    assert.ok(!existsSync(join(dir, from)), `${from} removed`);
  }
});

test('source map is renamed and sourceMappingURL is updated to match', () => {
  const dir = makeDist();
  const renames = hashAssets(dir);
  const jsHashedRel = renames.find(([from]) => from === 'js/main.js')[1];
  const hash = jsHashedRel.match(/main\.([0-9a-f]{8})\.js$/)[1];

  const js = readFileSync(join(dir, jsHashedRel), 'utf8');
  assert.ok(js.includes(`sourceMappingURL=main.${hash}.js.map`));
  assert.ok(existsSync(join(dir, `js/main.${hash}.js.map`)));
  assert.ok(!existsSync(join(dir, 'js/main.js.map')));
});

test('same content yields the same hash (deterministic)', () => {
  assert.deepEqual(hashAssets(makeDist()), hashAssets(makeDist()));
});

test('different css content yields a different hash', () => {
  const a = makeDist();
  const b = makeDist();
  writeFileSync(join(b, 'css/styles.css'), '.a{color:blue}');
  const cssA = hashAssets(a).find(([f]) => f === 'css/styles.css')[1];
  const cssB = hashAssets(b).find(([f]) => f === 'css/styles.css')[1];
  assert.notEqual(cssA, cssB);
});

test('throws if an expected reference is missing from index.html', () => {
  const dir = makeDist();
  writeFileSync(join(dir, 'index.html'), '<p>no assets here</p>');
  assert.throws(() => hashAssets(dir), /reference not found/);
});
