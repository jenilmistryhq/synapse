// Loads the printable case files and turns them into on-screen documents.
// The print HTML is the single source of truth: every page in the digital
// game is a .doc element lifted straight out of cases/<id>/print/*.html.

const manifests = new Map();
const pageCache = new Map();
const textCache = new Map();

export async function loadManifest(id) {
  if (!manifests.has(id)) {
    manifests.set(id, fetch(`cases/${id}/digital.json`, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Could not load case ${id} (${r.status})`);
      return r.json();
    }).then(m => { m.base = `cases/${id}/`; return m; }));
  }
  return manifests.get(id);
}

async function loadPages(url) {
  if (!pageCache.has(url)) {
    pageCache.set(url, fetch(url, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
      return r.text();
    }).then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      sanitize(doc.body);
      return [...doc.body.children].filter(el => el.classList.contains('doc'));
    }));
  }
  return pageCache.get(url);
}

// Case files are documents, never code. Strip anything executable before a
// page is inserted into the app, so a mistake (or a malicious edit) in any
// print file cannot run script on the site. The CSP in index.html backs this up.
const BLOCKED_TAGS = 'script, iframe, frame, frameset, object, embed, applet, link, meta, base, form, input, button, textarea, select, template, svg, math, noscript';
const URL_ATTRS = /^(href|src|srcset|action|formaction|xlink:href|poster|background|ping)$/i;

function sanitize(root) {
  root.querySelectorAll(BLOCKED_TAGS).forEach(el => el.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/[\x00-\x20]/g, '').toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (URL_ATTRS.test(name) && /^[a-z][a-z0-9+.-]*:/.test(value) && !/^https?:/.test(value)) el.removeAttribute(attr.name); // javascript:, data:, vbscript: ...
      else if (name === 'style' && /url\s*\(|expression\s*\(|@import/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  }
}

export function srcUrl(m, src) { return m.base + m.sources[src]; }

/* --- what is fetched when ------------------------------------------------------
   A game starts with the spoiler-free print files only. The Authority results arrive
   when the first Authority is spent; the Reconsider pages, Envelope S-1 and the
   answers (sealed.json) when the first accusation is made. Until then none of them is
   in the browser, so nothing in the network log gives the case away. */
const spoilerSources = m => new Set(((m.printKit && m.printKit.files) || []).filter(f => f.spoiler).map(f => f.src));

async function loadSources(m, keys) {
  const need = keys.filter(k => m.sources[k] && !m._pages[k]);
  const got = await Promise.all(need.map(async k => [k, await loadPages(srcUrl(m, k))]));
  Object.assign(m._pages, Object.fromEntries(got));
}

// Fetch and parse the case's public print files, then build the registry.
export async function loadCaseDocs(m) {
  if (m._reg) return m;
  m._pages = {};
  const hidden = spoilerSources(m);
  await loadSources(m, Object.keys(m.sources).filter(k => !hidden.has(k)));
  m._menu = parseMenu(m);
  m._steps = parseSteps(m);
  m._reg = buildRegistry(m);
  if (m.reveal && m.reveal.pages && m._pages[m.reveal.src]) m._chunks = revealChunks(m); // a case without sealed.json
  return m;
}

// The Authority results, once one has been spent.
export const loadSlips = m => loadSources(m, [m.slips.src]);

// The answers: sealed.json, merged into the manifest, plus every remaining print file.
export function loadSealed(m) {
  if (!m._sealed) {
    m._sealed = (async () => {
      const r = await fetch(`${m.base}sealed.json`, { cache: 'no-cache' });
      if (r.ok) mergeSealed(m, await r.json());
      else if (r.status !== 404) throw new Error(`Could not load the case's answers (${r.status})`);
      await loadSources(m, Object.keys(m.sources));
      for (const o of m.accusation.options) {
        if (o.reconsider && !m._reg.has(o.reconsider.id)) {
          const x = o.reconsider;
          m._reg.set(x.id, { id: x.id, kind: 'reconsider', title: x.title, src: x.src, pages: [x.page], group: 'Reconsider' });
        }
      }
      m._chunks = revealChunks(m);
      return m;
    })();
    m._sealed.catch(() => { m._sealed = null; });
  }
  return m._sealed;
}

// Same rules as mergeSealed in tools/case-files.js.
function mergeSealed(m, s) {
  m.accusation.determination = s.determination;
  for (const o of m.accusation.options) Object.assign(o, (s.options || {})[o.id] || {});
  for (const k of ['reveal', 'scoring', 'replay', 'debrief', 'badges']) {
    if (s[k] !== undefined) m[k] = k === 'reveal' || k === 'scoring' ? { ...(m[k] || {}), ...s[k] } : s[k];
  }
}

function page(m, src, i) {
  const p = m._pages[src] && m._pages[src][i];
  if (!p) throw new Error(`Missing page ${i} in ${src}`);
  return p;
}

// The Authority menu is parsed from the printed Schedule of Authorities.
function parseMenu(m) {
  const pg = page(m, m.menu.src, m.menu.page);
  return [...pg.querySelectorAll('table tr')]
    .map(tr => [...tr.querySelectorAll('td')])
    .filter(td => td.length === 4 && /^\d{2}$/.test(td[1].textContent.trim()))
    .map(td => ({
      n: td[1].textContent.trim(),
      html: td[2].innerHTML.trim(),
      text: td[2].textContent.replace(/\s+/g, ' ').trim(),
      to: td[3].textContent.trim(),
    }));
}

// Resolution Sheet questions are parsed from the printed sheet.
function parseSteps(m) {
  const pg = page(m, m.sheetPage.src, m.sheetPage.page);
  return [...pg.querySelectorAll('ol.steps > li > h3')].map(h => h.textContent.replace(/^\s*\d+\s*\S\s*/, '').trim());
}

function buildRegistry(m) {
  const reg = new Map();
  for (const d of m.documents) reg.set(d.id, { ...d, group: groupOf(m, d) });
  for (const a of m._menu) {
    const id = `SLIP ${a.n}`;
    reg.set(id, { id, kind: 'slip', title: a.text, src: m.slips.src, pages: [parseInt(a.n, 10) - 1], n: a.n, group: 'Authority results' });
  }
  for (const o of m.accusation.options) {
    if (!o.reconsider) continue;
    const r = o.reconsider;
    reg.set(r.id, { id: r.id, kind: 'reconsider', title: r.title, src: r.src, pages: [r.page], group: 'Reconsider' });
  }
  return reg;
}

function groupOf(m, d) {
  if (d.kind === 'brief') return 'Briefing';
  if (d.kind === 'base') return m.groups.base;
  if (d.kind === 'file') return `File ${d.file}`;
  return 'Other';
}

// Clone the pages of one document, tagged so highlights can find them.
export function renderPages(m, doc, highlights = {}) {
  return doc.pages.map((pi, i) => {
    const el = page(m, doc.src, pi).cloneNode(true);
    const key = `${doc.id}#${i}`;
    el.dataset.key = key;
    el.dataset.doc = doc.id;
    for (const hl of highlights[key] || []) wrapRange(el, hl.s, hl.e, hl.id);
    return el;
  });
}

export function pageNode(m, src, i) { return page(m, src, i).cloneNode(true); }

export function docText(m, doc) {
  const key = `${m.id}:${doc.id}`;
  if (!textCache.has(key)) {
    textCache.set(key, doc.pages.map(pi => page(m, doc.src, pi).textContent).join(' ').replace(/\s+/g, ' '));
  }
  return textCache.get(key);
}

// S-1 split into readable steps: a new chunk starts at every h2 and at the
// verdict box (the box holding the stamp). Rules and letterheads are dropped.
function revealChunks(m) {
  const r = m.reveal;
  const chunks = [];
  let cur = null;
  const start = kind => { cur = { kind, nodes: [] }; chunks.push(cur); };
  for (const pi of r.pages) {
    for (const node of page(m, r.src, pi).children) {
      if (node.matches('.head, .classbar, hr')) continue;
      const isVerdict = node.matches('.box') && node.querySelector('.stamp');
      if (node.tagName === 'H2' || isVerdict) start(isVerdict ? 'verdict' : 'step');
      else if (!cur) start('lead');
      cur.nodes.push(node);
    }
  }
  // A lead-in (the h1 title) belongs with the first real step.
  if (chunks[0] && chunks[0].kind === 'lead' && chunks[1]) {
    chunks[1].nodes.unshift(...chunks[0].nodes);
    chunks.shift();
  }
  if (chunks.length !== r.steps.length) {
    console.warn(`[synapse] ${m.id}: S-1 has ${chunks.length} sections, manifest expects ${r.steps.length}`);
  }
  return chunks;
}

export function chunkNodes(chunk) { return chunk.nodes.map(n => n.cloneNode(true)); }

/* --- highlights ------------------------------------------------------------
   A highlight is stored as character offsets into a page's text. The print
   files never change during play, so offsets are stable across reloads. */

export function rangeToOffsets(root, range) {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const pre = document.createRange();
  pre.setStart(root, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const s = pre.toString().length;
  const e = s + range.toString().length;
  return e > s ? { s, e } : null;
}

const SKIP_PARENTS = /^(TABLE|TBODY|THEAD|TFOOT|TR|COLGROUP)$/;

export function wrapRange(root, start, end, id) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let pos = 0;
  for (const n of nodes) {
    const len = n.data.length;
    const ns = pos, ne = pos + len;
    pos = ne;
    if (ne <= start || ns >= end) continue;
    if (SKIP_PARENTS.test(n.parentNode.nodeName)) continue;
    const a = Math.max(start, ns) - ns;
    const b = Math.min(end, ne) - ns;
    if (b <= a) continue;
    let node = n;
    if (a > 0) node = node.splitText(a);
    if (b - a < node.data.length) node.splitText(b - a);
    if (!node.data.trim()) continue;
    const mark = document.createElement('mark');
    mark.className = 'hl';
    mark.dataset.hl = id;
    node.parentNode.insertBefore(mark, node);
    mark.appendChild(node);
  }
}

let catalogPromise = null;
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch('cases/index.json', { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Could not load the case list (${r.status}). Run "node tools/build-catalog.js".`);
      return r.json();
    }).catch(e => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}
