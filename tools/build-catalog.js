#!/usr/bin/env node
/**
 * Builds cases/index.json (the case list the web app loads) from every
 * cases/<id>/digital.json, and checks that each digital.json only points at
 * pages that exist in its print files.
 *
 * Run after adding or editing a case:   node tools/build-catalog.js
 * Exits non-zero if any case has a broken reference.
 */
const fs = require('fs');
const path = require('path');

const casesDir = path.resolve(__dirname, '..', 'cases');
const TIERS = ['Easy', 'Medium', 'Hard', 'Expert'];
const errors = [];
const entries = [];

// A page is a <div> whose class list starts with "doc" (it may also carry a fit-NN class).
const countPages = file => (fs.readFileSync(file, 'utf8').match(/<div class="doc(?: [^"]*)?"/g) || []).length;

for (const id of fs.readdirSync(casesDir).sort()) {
  const manifestPath = path.join(casesDir, id, 'digital.json');
  if (!fs.existsSync(manifestPath)) continue;
  const err = msg => errors.push(`${id}: ${msg}`);
  let m;
  try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { err(`invalid JSON (${e.message})`); continue; }
  if (m.id !== id) err(`"id" is ${m.id} but the folder is ${id}`);
  for (const k of ['number', 'title', 'tier', 'time', 'tagline', 'hook', 'sources', 'budget', 'documents', 'accusation', 'reveal', 'scoring']) {
    if (m[k] == null) err(`missing "${k}"`);
  }
  if (m.tier && !TIERS.includes(m.tier)) err(`tier "${m.tier}" is not one of ${TIERS.join(', ')}`);
  if (!m.budget || !m.budget['1']) err('budget has no entry for "1" (solo)');

  // Page counts per print file.
  const pages = {};
  for (const [key, rel] of Object.entries(m.sources || {})) {
    const file = path.join(casesDir, id, rel);
    if (!fs.existsSync(file)) { err(`source "${key}" missing: ${rel}`); continue; }
    pages[key] = countPages(file);
  }
  const check = (src, i, what) => {
    if (!(src in pages)) return err(`${what}: unknown source "${src}"`);
    if (!Number.isInteger(i) || i < 0 || i >= pages[src]) err(`${what}: page ${i} out of range (${src} has ${pages[src]})`);
  };

  if (m.menu) check(m.menu.src, m.menu.page, 'menu');
  if (m.sheetPage) check(m.sheetPage.src, m.sheetPage.page, 'sheetPage');
  const ids = new Set();
  for (const d of m.documents || []) {
    if (ids.has(d.id)) err(`duplicate document id ${d.id}`);
    ids.add(d.id);
    for (const p of d.pages || []) check(d.src, p, `document ${d.id}`);
  }
  if (!ids.has('BRIEF')) err('no document with id "BRIEF"');
  for (const o of (m.accusation && m.accusation.options) || []) {
    if (o.reconsider) check(o.reconsider.src, o.reconsider.page, `reconsider ${o.id}`);
  }
  const culprits = ((m.accusation && m.accusation.options) || []).filter(o => o.type === m.accusation.determination && !o.reconsider);
  if (culprits.length !== 1) err(`expected exactly one correct accusation option, found ${culprits.length}`);
  if (m.reveal) {
    check(m.reveal.src, m.reveal.cover, 'reveal cover');
    (m.reveal.pages || []).forEach(p => check(m.reveal.src, p, 'reveal page'));
    if (m.reveal.scoringPage != null) check(m.reveal.src, m.reveal.scoringPage, 'reveal scoringPage');
  }
  if (m.slips && pages[m.slips.src] != null && m.menu && pages[m.menu.src] != null) {
    const menuHtml = fs.readFileSync(path.join(casesDir, id, m.sources[m.menu.src]), 'utf8');
    const slipCount = pages[m.slips.src];
    const menuRows = (menuHtml.match(/<td class="mono">\d{2}<\/td>/g) || []).length;
    if (menuRows && menuRows !== slipCount) err(`Authority menu lists ${menuRows} rows but ${m.sources[m.slips.src]} has ${slipCount} pages`);
  }
  // Hints ("Ask the Unit"): each needs a real document and 1-3 steps.
  const hintIds = new Set();
  for (const x of m.hints || []) {
    if (!x.id || hintIds.has(x.id)) err(`hint "${x.id}" is missing an id or is a duplicate`);
    hintIds.add(x.id);
    if (x.needs && !ids.has(x.needs)) err(`hint ${x.id}: needs unknown document ${x.needs}`);
    if (!Array.isArray(x.steps) || !x.steps.length || x.steps.length > 3) err(`hint ${x.id}: needs 1 to 3 steps`);
  }
  // Persons of interest: safe ids (they name portrait files) and a drawn face.
  const personIds = new Set();
  for (const p of (m.persons && m.persons.list) || []) {
    if (!/^[a-z0-9-]+$/.test(p.id || '') || personIds.has(p.id)) err(`person "${p.id}" needs a unique lowercase id (letters, digits, hyphens)`);
    personIds.add(p.id);
    if (!fs.existsSync(path.join(casesDir, id, 'portraits', `${p.id}.svg`))) console.warn(`  ${id}: no portrait for ${p.id} (run "npm run portraits"); initials will show instead`);
  }
  if (m.persons && !(m.persons.statuses || []).includes('Open')) err('persons.statuses must include "Open"');
  // Replay clues: each phrase must really be in its document (spaces are ignored,
  // as they are when the app looks for it, because table cells run together).
  if (m.replay) {
    const pageTexts = {};
    const textOf = src => pageTexts[src] ||= fs.readFileSync(path.join(casesDir, id, m.sources[src]), 'utf8')
      .split(/<div class="doc(?: [^"]*)?"/).slice(1)
      .map(pg => pg.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ''));
    for (const [n, c] of m.replay.entries()) {
      const slip = /^SLIP (\d{2})$/.exec(c.doc || '');
      const d = (m.documents || []).find(x => x.id === c.doc);
      const where = slip && m.slips ? { src: m.slips.src, pages: [+slip[1] - 1] } : d;
      if (!where || !m.sources[where.src]) { err(`replay ${n + 1}: unknown document "${c.doc}"`); continue; }
      if (!c.find || !c.note) { err(`replay ${n + 1}: needs "find" and "note"`); continue; }
      const want = c.find.replace(/\s+/g, '');
      if (!where.pages.some(p => (textOf(where.src)[p] || '').includes(want))) err(`replay ${n + 1}: "${c.find}" is not in ${c.doc}`);
    }
  }
  // Tape voices: speaker code -> "f", "m" or "n".
  for (const [code, kind] of Object.entries(m.voices || {})) {
    if (!['f', 'm', 'n'].includes(kind)) err(`voices.${code}: use "f", "m" or "n", not "${kind}"`);
  }
  // Exhibits: each is listed by a real document (or an Authority slip) and uses a known icon.
  const exhibitIcons = new Set([...fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'exhibits.js'), 'utf8').matchAll(/^  ([a-z]+): '</gm)].map(x => x[1]));
  const slipCount = m.slips && pages[m.slips.src];
  for (const x of m.exhibits || []) {
    const slip = /^SLIP (\d{2})$/.exec(x.source || '');
    if (!(ids.has(x.source) || (slip && +slip[1] >= 1 && +slip[1] <= slipCount))) err(`exhibit ${x.ref}: unknown source "${x.source}"`);
    if (!x.ref || !x.name || !x.found) err(`exhibit ${x.ref || '?'}: needs ref, name and found`);
    if (x.icon && !exhibitIcons.has(x.icon)) err(`exhibit ${x.ref}: unknown icon "${x.icon}" (have: ${[...exhibitIcons].join(', ')})`);
  }
  for (const ph of m.phases || []) {
    for (const d of ph.docs) {
      if (d.startsWith('file:')) { if (!(m.documents || []).some(x => x.file === d.slice(5))) err(`phase references unknown file ${d}`); }
      else if (!ids.has(d)) err(`phase references unknown document ${d}`);
    }
  }

  entries.push({
    id: m.id, number: m.number, title: m.title, tier: m.tier, time: m.time,
    tagline: m.tagline, hook: m.hook, note: m.note || '', order: m.order ?? 999,
  });
}

entries.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
entries.forEach(e => delete e.order);

if (errors.length) {
  console.error(`FAIL - ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
fs.writeFileSync(path.join(casesDir, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), cases: entries }, null, 2) + '\n');
console.log(`OK - ${entries.length} case(s) written to cases/index.json`);
