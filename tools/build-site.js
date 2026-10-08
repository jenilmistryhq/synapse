#!/usr/bin/env node
/**
 * Assembles the website into _site/ for publishing: the app, the service worker,
 * every case, and the print kit PDFs and zips (which are built, not committed).
 * Run after "npm run pdf". The GitHub deploy workflow does both.
 *
 *   node tools/build-site.js
 *
 * Refuses to publish if a case has no PDFs, or if any PDF has a different number
 * of pages from its case's print kit, which would mean a page spilled onto a
 * second sheet and the envelope numbering in the print guide no longer holds.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_site');
const errors = [];

// What the site needs. Nothing else in the repository is published.
const TOP = ['index.html', 'sw.js', 'manifest.webmanifest'];
const DIRS = ['app', 'cases'];

// Authoring files that are nothing but the solution. The game never reads them.
const NEVER_PUBLISH = new Set(['case-bible.md', 'ledger.json']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (NEVER_PUBLISH.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

// Sealed print pages ask search engines not to index them, so a case's answers do
// not turn up in search results. (A project site cannot set robots.txt; this can.)
function markSealedNoindex() {
  let n = 0;
  for (const id of fs.readdirSync(path.join(OUT, 'cases'))) {
    const mPath = path.join(ROOT, 'cases', id, 'digital.json');
    if (!fs.existsSync(mPath)) continue;
    const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    for (const f of (m.printKit && m.printKit.files) || []) {
      if (!f.spoiler) continue;
      const file = path.join(OUT, 'cases', id, m.sources[f.src]);
      const html = fs.readFileSync(file, 'utf8');
      if (!html.includes('name="robots"')) { fs.writeFileSync(file, html.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow">')); n++; }
    }
  }
  return n;
}

// Every case's PDFs exist and match its print kit, page for page.
for (const id of fs.readdirSync(path.join(ROOT, 'cases')).sort()) {
  const mPath = path.join(ROOT, 'cases', id, 'digital.json');
  if (!fs.existsSync(mPath)) continue;
  const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  if (!m.printKit) continue;
  const idxPath = path.join(ROOT, 'cases', id, 'print', 'pdf', 'index.json');
  if (!fs.existsSync(idxPath)) { errors.push(`${id}: no PDFs. Run "npm run pdf" first.`); continue; }
  const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  for (const f of m.printKit.files) {
    const built = index.files.find(x => x.src === f.src);
    if (!built) errors.push(`${id}: no PDF for ${f.name}`);
    else if (built.pages !== f.pages) errors.push(`${id}: ${built.file} has ${built.pages} pages, the print kit says ${f.pages} (a page spilled onto a second sheet?)`);
  }
  for (const p of [...index.files, ...index.packs]) {
    if (!fs.existsSync(path.join(ROOT, 'cases', id, 'print', 'pdf', p.file))) errors.push(`${id}: ${p.file} is listed but missing`);
  }
}
if (errors.length) {
  console.error(`Not publishing - ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const f of TOP) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(OUT, d));
const sealedPages = markSealedNoindex();

let files = 0, bytes = 0;
(function count(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p); else { files++; bytes += fs.statSync(p).size; }
  }
})(OUT);
console.log(`OK - _site/ ready: ${files} files, ${(bytes / 1048576).toFixed(1)} MB. ${sealedPages} sealed print files marked noindex; case bibles and ledgers left out.`);
