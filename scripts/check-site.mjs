import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
// These checks target this plain, quoted-attribute HTML page, not all HTML syntax.
const attributes = name => [...html.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi'))]
  .map(match => match[2]);
const ids = attributes('id');
const knownIds = new Set(ids);

assert.equal(knownIds.size, ids.length, 'HTML IDs must be unique');
assert.match(html, /<html\b[^>]*\blang=["']he["']/i, 'Keep the Hebrew document language');
assert.match(html, /<html\b[^>]*\bdir=["']rtl["']/i, 'Keep the RTL document direction');

for (const id of [...attributes('for'), ...attributes('data-tab')]) {
  assert(knownIds.has(id), `HTML refers to missing element #${id}`);
}
for (const [, , id] of app.matchAll(/\$\(\s*(["'])([^"']+)\1\s*\)/g)) {
  assert(knownIds.has(id), `app.js refers to missing element #${id}`);
}

const scriptFiles = new Set(['app.js']);
let localAssets = 0;
for (const reference of [...attributes('src'), ...attributes('href')]) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) continue;
  if (reference.startsWith('#')) {
    assert(knownIds.has(decodeURIComponent(reference.slice(1))), `Missing anchor ${reference}`);
    continue;
  }
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!pathname) continue;
  const localFile = resolve(root, pathname.replace(/^\//, ''));
  const localPath = relative(root, localFile);
  assert(localPath !== '..' && !localPath.startsWith(`..${sep}`), `Asset escapes repository: ${reference}`);
  assert(statSync(localFile, { throwIfNoEntry: false })?.isFile(), `Missing local asset: ${reference}`);
  if (/\.(?:m?js|cjs)$/i.test(localPath)) scriptFiles.add(localPath);
  localAssets++;
}

for (const script of scriptFiles) {
  execFileSync(process.execPath, ['--check', resolve(root, script)], { stdio: 'inherit' });
}
console.log(`PASS: ${ids.length} unique HTML IDs, ${localAssets} local asset references, and ${scriptFiles.size} JavaScript syntax check(s).`);
