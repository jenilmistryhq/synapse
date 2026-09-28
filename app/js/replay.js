// Replay: after a case is solved, walk back through the file with the key
// clues marked in red pen, beside the highlights you made while playing.
// The clues come from "replay" in digital.json: [{ doc, find, note }, ...] in
// solve order. "find" is an exact phrase from that document; spaces in it are
// ignored when matching, because table cells run together in the page text.

import { h, icon, plural, clear, append } from './util.js';
import { renderPages, pageNode, wrapRange } from './docs.js';
import { getSettings, motionReduced } from './settings.js';

// Where a phrase sits in a page's text, as character offsets (or null).
function locate(text, phrase) {
  const want = phrase.replace(/\s+/g, '');
  const idx = [];
  let compact = '';
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { idx.push(i); compact += text[i]; }
  const k = compact.indexOf(want);
  return k < 0 ? null : { s: idx[k], e: idx[k + want.length - 1] + 1 };
}

export function renderReplay(app, m, st, go) {
  const reg = m._reg;
  const hl = (st && st.highlights) || {};
  const refOf = id => { const d = reg.get(id); return d.kind === 'slip' ? `Authority ${d.n}` : d.kind === 'reconsider' ? 'Reconsider' : d.id; };

  // Find every clue once: which page it is on, where, and whether you marked it.
  const clues = (m.replay || []).map((c, n) => {
    const d = reg.get(c.doc);
    if (!d) return null;
    for (let i = 0; i < d.pages.length; i++) {
      const at = locate(pageNode(m, d.src, d.pages[i]).textContent, c.find);
      if (!at) continue;
      const key = `${d.id}#${i}`;
      const marked = (hl[key] || []).some(r => r.s < at.e && r.e > at.s);
      return { ...c, n: n + 1, key, page: i, ...at, marked };
    }
    console.warn(`[synapse] replay ${n + 1}: "${c.find}" not found in ${c.doc}`);
    return null;
  }).filter(Boolean);
  const found = clues.filter(c => c.marked).length;

  // Every document, including Authority results you never opened.
  const order = [...reg.keys()].filter(id => reg.get(id).kind !== 'reconsider');
  let current = clues.length ? clues[0].doc : order[0];
  let active = null;

  const trail = h('ol', { class: 'rp-trail' });
  const view = h('div', { class: 'rp-scroll', tabindex: '0', 'aria-label': 'Document text' });
  const pick = h('select', { class: 'rd-pick', 'aria-label': 'Choose a document', onchange: e => show(e.target.value) },
    order.map(id => { const n = clues.filter(c => c.doc === id).length; return h('option', { value: id }, `${refOf(id)} · ${reg.get(id).title}${n ? ` (${plural(n, 'clue')})` : ''}`); }));

  function show(id, clue = null) {
    current = id;
    pick.value = id;
    const d = reg.get(id);
    const pages = renderPages(m, d, hl);
    pages.forEach((pg, i) => {
      const here = clues.filter(x => x.doc === id && x.page === i);
      // Mark every clue before adding any number badge: a badge adds text to
      // the page and would shift the offsets of the clues after it.
      for (const c of here) wrapRange(pg, c.s, c.e, `clue-${c.n}`);
      for (const c of here) {
        const marks = [...pg.querySelectorAll(`mark[data-hl="clue-${c.n}"]`)];
        marks.forEach(mk => { mk.className = `clue${c.marked ? ' got' : ''}`; mk.dataset.clue = c.n; });
        if (marks[0]) marks[0].before(h('span', { class: 'clue-n', 'aria-hidden': 'true' }, c.n));
      }
    });
    view.replaceChildren(h('div', { class: 'paper rd-paper', style: { zoom: getSettings().docZoom } }, pages));
    drawTrail();
    if (clue) {
      const mk = view.querySelector(`mark[data-clue="${clue.n}"]`);
      if (mk) {
        mk.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
        view.querySelectorAll(`mark[data-clue="${clue.n}"]`).forEach(x => { x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); });
      }
    } else view.scrollTop = 0;
  }

  function drawTrail() {
    trail.replaceChildren(...clues.map(c => h('li', { class: `${c.doc === current ? 'here' : ''} ${active === c.n ? 'on' : ''}` },
      h('button', { class: 'rp-clue', onclick: () => { active = c.n; show(c.doc, c); }, 'aria-label': `Clue ${c.n}, ${refOf(c.doc)}. ${c.marked ? 'You marked it.' : 'Missed.'} ${c.note}` },
        h('span', { class: 'rp-n' }, c.n),
        h('span', { class: 'rp-body' },
          h('span', { class: 'rp-top' }, h('b', {}, refOf(c.doc)), h('span', { class: `rp-got ${c.marked ? 'yes' : 'no'}` }, c.marked ? 'You marked it' : 'Missed')),
          h('span', { class: 'rp-note' }, c.note))))));
  }

  append(clear(app), h('main', { class: 'rp' },
    h('header', { class: 'rp-top-bar' },
      h('a', { class: 'btn ghost sm', href: `#/play/${m.id}` }, icon('left'), 'Back to the result'),
      h('div', { class: 'rp-title' }, h('span', { class: 'case-no' }, `Replay · Case ${m.number}`), h('b', {}, m.title)),
      h('div', { class: 'rp-score' }, clues.length ? [h('b', {}, `${found} of ${clues.length}`), ' key clues were among your highlights'] : 'No key clues are listed for this case yet.')),
    h('div', { class: 'rp-main' },
      h('aside', { class: 'rp-side', 'aria-label': 'The clue trail' },
        h('div', { class: 'rp-h' }, 'The trail, in order'),
        h('p', { class: 'rp-legend' }, h('mark', { class: 'clue' }, 'red pen'), ' is a key clue. ', h('mark', { class: 'hl' }, 'yellow'), ' is what you highlighted.'),
        trail),
      h('section', { class: 'rp-doc', 'aria-label': 'Document' },
        h('div', { class: 'rd-col-head' }, pick),
        view))));
  if (clues[0]) active = clues[0].n;
  show(current, clues[0] || null);
  return () => {};
}
