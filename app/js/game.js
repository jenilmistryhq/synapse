// The investigation desk. Folders, sealed envelopes, a clipboard, a notebook,
// a calculator and a bell, on a wooden desk. Documents open in a reader;
// the clipboard and notebook dock beside it so you can write while you read.

import { h, $$, icon, fmtClock, debounce, toast, modal, confirmModal, calc, plural } from './util.js';
import { renderPages, rangeToOffsets, wrapRange } from './docs.js';
import {
  saveState, clearState, timerNow, timerStart, timerStop, timerRebase, timerRunning,
  authoritiesOpen, remaining, fileStillSplit, isPhased,
} from './state.js';
import { openEnvelope } from './fx.js';
import { sfx, soundOn, setSound } from './sfx.js';

const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
const tilt = id => { let x = 0; for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 997; return ((x % 7) - 3) * 0.45; };

export function mountGame(root, m, st, { go }) {
  const reg = m._reg;
  const phased = isPhased(m, st);
  const listeners = [];
  const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); listeners.push(() => target.removeEventListener(ev, fn, opts)); };
  const ui = { reader: null, compare: null, active: 0, drawer: null };

  if (st.timer.since) st.timer.since = Date.now();
  if (st.timer.auto) timerStart(st);
  document.body.classList.add('desk-lock');

  const save = debounce(() => saveState(st), 300);
  const saveNow = () => save.flush();

  /* --- shell ---------------------------------------------------------------- */
  const top = h('header', { class: 'dk-top' });
  const surface = h('main', { class: 'dk-surface', 'aria-label': 'Desk' });
  const reader = h('section', { class: 'rd', hidden: true, 'aria-label': 'Document reader' });
  const drawer = h('aside', { class: 'dw', hidden: true });
  const citeList = h('datalist', { id: 'cite-list' });
  const game = h('div', { class: 'dk' }, top, surface, reader, drawer, citeList);
  root.replaceChildren(game);

  /* --- documents available ---------------------------------------------------- */
  const fileDocIds = f => m.documents.filter(d => d.file === f).map(d => d.id);
  const fileName = f => ((m.files || []).find(x => x.id === f) || {}).name || f;
  const expand = d => (d.startsWith('file:') ? fileDocIds(d.slice(5)) : [d]);

  function available() {
    const ids = [];
    const add = id => { if (reg.has(id) && !ids.includes(id)) ids.push(id); };
    if (phased) m.phases.slice(0, st.phase).forEach(p => p.docs.forEach(d => expand(d).forEach(add)));
    else m.documents.forEach(d => add(d.id));
    st.spent.forEach(s => add(`SLIP ${s.n}`));
    st.accusations.forEach(a => a.reconsider && add(a.reconsider));
    return ids;
  }
  const refOf = id => { const d = reg.get(id); return d.kind === 'slip' ? `Authority ${d.n}` : d.kind === 'reconsider' ? 'Reconsider' : d.id; };

  /* --- top bar ---------------------------------------------------------------- */
  let clockText;
  function renderTop() {
    const left = remaining(st);
    const tries = 3 - st.accusations.length;
    clockText = h('span', { class: 't' }, fmtClock(timerNow(st)));
    top.replaceChildren(
      h('a', { class: 'dk-back', href: '#/', title: 'Back to all cases (progress is saved)' }, icon('left'), h('span', { class: 'brand-mark' })),
      h('div', { class: 'dk-case' }, h('span', { class: 'case-no' }, `Case ${m.number} · ${m.tier}`), h('span', { class: 'case-title' }, m.title)),
      h('div', { class: 'dk-stats' },
        h('button', { class: `watch ${timerRunning(st) ? '' : 'paused'}`, onclick: toggleTimer, title: timerRunning(st) ? 'Pause the clock' : 'Resume the clock' },
          h('span', { class: 'watch-face' }, icon(timerRunning(st) ? 'clock' : 'pause')), clockText),
        h('span', { class: 'tokens', title: `${left} of ${st.budget} Authorities left` },
          Array.from({ length: st.budget }, (_, i) => h('i', { class: i < left ? 'on' : '' })), h('b', {}, left)),
        h('span', { class: `tries ${tries === 1 ? 'final' : ''}`, title: 'Accusations left. The third is final.' }, icon('accuse'), h('b', {}, tries === 1 ? 'Final' : tries))),
      h('div', { class: 'dk-actions' },
        h('button', { class: 'iconbtn', title: soundOn() ? 'Mute sounds' : 'Turn sounds on', 'aria-label': 'Toggle sound', onclick: () => { setSound(!soundOn()); renderTop(); if (soundOn()) sfx.tick(); } }, icon(soundOn() ? 'sound' : 'mute')),
        h('button', { class: 'iconbtn', title: 'Rules and help', 'aria-label': 'Rules and help', onclick: showHelp }, icon('help')),
        h('button', { class: 'stamp-btn', onclick: accuse, title: 'Make an accusation' }, h('span', {}, 'Accuse'))));
  }

  function toggleTimer() {
    if (timerRunning(st)) { timerStop(st); toast('Clock paused'); } else { timerStart(st); toast('Clock running'); }
    sfx.tick(); saveNow(); renderTop();
  }

  const tick = setInterval(() => { if (clockText) clockText.textContent = fmtClock(timerNow(st)); }, 1000);
  const autosave = setInterval(() => { timerRebase(st); saveState(st); }, 15000);
  on(window, 'pagehide', () => { timerRebase(st); saveState(st); });
  on(document, 'visibilitychange', () => { if (document.hidden) { timerRebase(st); saveState(st); } });

  /* --- the desk surface --------------------------------------------------------- */
  function trayFor(id) {
    const d = reg.get(id);
    if (d.kind === 'brief') return ['brief', 'Briefing'];
    if (d.kind === 'base') return ['base', m.groups.base];
    if (d.kind === 'file') return [`file-${d.file}`, `File ${d.file} · ${fileName(d.file)}`];
    if (d.kind === 'slip') return ['slip', 'Returned inquiries'];
    return ['reconsider', 'Reconsider'];
  }

  function folder(id) {
    const d = reg.get(id);
    const unread = !st.read[id];
    const hl = d.pages.reduce((a, _, i) => a + ((st.highlights[`${id}#${i}`] || []).length), 0);
    return h('button', {
      class: `folder k-${d.kind}${d.cover ? ' cover' : ''}${unread ? ' unread' : ''}`,
      style: { '--tilt': `${tilt(id)}deg` },
      onclick: () => openReader(id),
      title: d.title,
    },
    h('span', { class: 'folder-tab' }, refOf(id)),
    h('span', { class: 'folder-body' },
      h('span', { class: 'folder-label' }, d.title),
      h('span', { class: 'folder-meta' }, plural(d.pages.length, 'page'), hl ? ` · ${hl} marked` : '')),
    unread ? h('span', { class: 'clip', 'aria-label': 'Unread' }, 'New') : null);
  }

  function lockedBundles() {
    if (!phased) return [];
    return m.phases.slice(st.phase).map((p, i) => {
      const n = p.docs.flatMap(expand).length;
      return h('button', { class: 'folder bundle', style: { '--tilt': `${tilt('ph' + i)}deg` },
        onclick: () => { sfx.tick(); toast(`Sealed until Phase ${st.phase + i + 1}. Answer the memo to open the next phase.`); } },
      h('span', { class: 'folder-tab' }, `Phase ${st.phase + i + 1}`),
      h('span', { class: 'folder-body' }, h('span', { class: 'folder-label' }, `Sealed: ${p.read}`), h('span', { class: 'folder-meta' }, plural(n, 'document'))),
      h('span', { class: 'tape' }, 'Sealed'));
    });
  }

  function memo() {
    if (phased) {
      const p = m.phases[st.phase - 1];
      const last = st.phase === m.phases.length;
      const val = st.hypotheses[st.phase] || '';
      const btn = h('button', { class: 'stamp-btn sm', disabled: !val.trim(), onclick: advancePhase }, h('span', {}, `Open Phase ${st.phase + 1}`));
      return h('div', { class: 'memo' },
        h('span', { class: 'pin' }),
        h('div', { class: 'memo-head' }, h('b', {}, 'Memo · Case Review Unit'), h('span', {}, `Phase ${st.phase} of ${m.phases.length}`)),
        h('p', { class: 'memo-read' }, `Read ${p.read}.`),
        last ? h('p', { class: 'memo-q' }, 'Everything is open. Write up the Resolution Sheet and accuse when you are ready.') : [
          h('p', { class: 'memo-q' }, p.prompt),
          h('textarea', { class: 'hand', rows: 3, value: val, 'aria-label': p.prompt, placeholder: 'Write it here before you move on...',
            oninput: e => { st.hypotheses[st.phase] = e.target.value; btn.disabled = !e.target.value.trim(); save(); } }),
          btn]);
    }
    return h('div', { class: 'memo' },
      h('span', { class: 'pin' }),
      h('div', { class: 'memo-head' }, h('b', {}, 'Memo · Case Review Unit'), h('span', {}, 'Standing orders')),
      h('p', { class: 'memo-q' }, 'The documents do not lie. People might. Spend Authorities only on what the file points at. Write every step down, with a citation, before you accuse.'),
      h('button', { class: 'linkbtn', onclick: () => openReader('BRIEF') }, 'Re-read the briefing'));
  }

  function envelopes() {
    const gate = authoritiesOpen(m, st);
    return h('div', { class: 'env-tray' },
      m._menu.map(a => {
        const spent = st.spent.find(s => s.n === a.n);
        const locked = !spent && !gate.ok;
        return h('button', {
          class: `mini-env${spent ? ' opened' : ''}${locked ? ' locked' : ''}`,
          style: { '--tilt': `${tilt('e' + a.n) * 1.4}deg` },
          title: `${a.text} (${a.to})`,
          onclick: () => (spent ? openReader(`SLIP ${a.n}`) : spend(a)),
        },
        h('span', { class: 'mini-flap' }),
        h('span', { class: 'mini-n' }, a.n),
        h('span', { class: 'mini-label' }, a.text),
        spent ? h('span', { class: 'mini-state' }, 'Opened') : h('span', { class: 'mini-seal' }));
      }));
  }

  function tool(cls, title, sub, onclick, inner) {
    return h('button', { class: `tool ${cls}`, onclick, title }, inner, h('span', { class: 'tool-label' }, title), sub ? h('span', { class: 'tool-sub' }, sub) : null);
  }

  function renderDesk() {
    const ids = available();
    const trays = new Map();
    for (const id of ids) {
      const [key, label] = trayFor(id);
      if (!trays.has(key)) trays.set(key, { label, ids: [] });
      trays.get(key).ids.push(id);
    }
    const done = st.sheet.steps.filter(s => s.text.trim() && s.cites.length).length;
    const unread = ids.filter(id => !st.read[id]).length;
    const gate = authoritiesOpen(m, st);
    citeList.replaceChildren(...ids.filter(id => reg.get(id).kind !== 'brief').map(id => h('option', { value: refOf(id) === 'Reconsider' ? id : refOf(id).replace(/^Authority /, 'SLIP ') })));

    surface.replaceChildren(h('div', { class: 'dk-grid' },
      h('section', { class: 'dk-files' },
        h('div', { class: 'plate' }, 'Case file', h('span', {}, `${plural(ids.length, 'document')}${unread ? ` · ${unread} new` : ''}`)),
        [...trays].filter(([k]) => k !== 'slip' && k !== 'reconsider').map(([k, t]) => h('div', { class: `tray t-${k}` },
          h('h3', { class: 'tray-h' }, t.label), h('div', { class: 'folders' }, t.ids.map(folder)))),
        phased && st.phase < m.phases.length ? h('div', { class: 'tray t-locked' }, h('h3', { class: 'tray-h' }, 'Still sealed'), h('div', { class: 'folders' }, lockedBundles())) : null,
        ['slip', 'reconsider'].filter(k => trays.has(k)).map(k => h('div', { class: `tray t-${k}` },
          h('h3', { class: 'tray-h' }, trays.get(k).label), h('div', { class: 'folders' }, trays.get(k).ids.map(folder))))),
      h('section', { class: 'dk-side' },
        memo(),
        h('div', { class: 'env-box' },
          h('div', { class: 'plate' }, 'Sealed Authorities', h('span', {}, `${remaining(st)} of ${st.budget} left`)),
          !gate.ok && remaining(st) > 0 ? h('p', { class: 'env-gate' }, icon('lock'), gate.why) : null,
          envelopes(),
          h('p', { class: 'env-advice' }, m.advice)),
        h('div', { class: 'tools' },
          tool('t-clip', 'Resolution Sheet', `${done} of ${st.sheet.steps.length} steps written`, () => openDrawer('sheet'), h('span', { class: 'art clipboard' }, h('i'), h('i'), h('i'))),
          tool('t-note', 'Notebook', st.notes.trim() ? plural(st.notes.trim().split('\n').length, 'line') : 'Empty', () => openDrawer('notes'), h('span', { class: 'art notebook' })),
          tool('t-calc', 'Calculator', null, openCalculator, h('span', { class: 'art calculator' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i'))),
          tool('t-bell', 'Breakthrough', st.breakthroughs.length ? plural(st.breakthroughs.length, 'logged', 'logged') : 'Ring it', logBreakthrough, h('span', { class: 'art bell' }))))));
  }

  /* --- reader ------------------------------------------------------------------- */
  function openReader(id, col = null) {
    if (!available().includes(id)) return;
    const fresh = !st.read[id];
    st.read[id] = true;
    if (col === 1 && ui.compare !== null) ui.compare = id;
    else if (ui.compare !== null && ui.active === 1 && ui.reader) ui.compare = id;
    else ui.reader = id;
    save(); sfx.paper();
    renderReader(true);
    if (fresh) renderDesk();
  }

  function closeReader() {
    ui.reader = null; ui.compare = null; ui.active = 0;
    reader.hidden = true; hideSel(); sfx.close();
    game.classList.remove('reading');
    renderDesk();
  }

  function column(id, idx) {
    const d = reg.get(id);
    const order = available();
    const k = order.indexOf(id);
    const pick = h('select', { class: 'rd-pick', 'aria-label': 'Change document', onchange: e => { ui.active = idx; openReader(e.target.value, idx); } },
      order.map(o => h('option', { value: o }, `${refOf(o)} · ${reg.get(o).title}`)));
    pick.value = id;
    const col = h('div', { class: `rd-col ${ui.compare !== null && ui.active === idx ? 'active' : ''}`, dataset: { col: String(idx) } },
      h('div', { class: 'rd-col-head' },
        h('span', { class: 'rd-ref' }, refOf(id)), pick,
        ui.compare !== null ? h('button', { class: 'iconbtn sm', title: 'Close this side', 'aria-label': 'Close this side', onclick: () => { if (idx === 0) { ui.reader = ui.compare; } ui.compare = null; ui.active = 0; renderReader(); } }, icon('close')) : null),
      h('div', { class: 'rd-scroll' },
        h('div', { class: 'paper rd-paper', style: { zoom: st.ui.zoom } }, renderPages(m, d, st.highlights)),
        h('div', { class: 'rd-foot' },
          k > 0 ? h('button', { class: 'btn ghost sm', onclick: () => { ui.active = idx; openReader(order[k - 1], idx); } }, icon('left'), refOf(order[k - 1])) : h('span'),
          k < order.length - 1 ? h('button', { class: 'btn ghost sm', onclick: () => { ui.active = idx; openReader(order[k + 1], idx); } }, refOf(order[k + 1]), icon('right')) : h('span'))));
    col.addEventListener('mousedown', () => { if (ui.compare !== null && ui.active !== idx) { ui.active = idx; $$('.rd-col', reader).forEach((c, j) => c.classList.toggle('active', j === idx)); } });
    return col;
  }

  function renderReader(animate = false) {
    if (!ui.reader) return;
    const d = reg.get(ui.reader);
    reader.hidden = false;
    game.classList.add('reading');
    const cols = [column(ui.reader, 0)];
    if (ui.compare !== null) cols.push(column(ui.compare, 1));
    reader.replaceChildren(
      h('div', { class: 'rd-bar' },
        h('button', { class: 'btn ghost sm', onclick: closeReader }, icon('left'), 'Back to desk'),
        h('div', { class: 'rd-title' }, ui.compare !== null ? 'Comparing two documents' : d.title),
        h('div', { class: 'rd-tools' },
          h('button', { class: 'iconbtn sm', title: 'Smaller text', 'aria-label': 'Smaller text', onclick: () => zoom(-1) }, icon('zoomOut')),
          h('button', { class: 'iconbtn sm', title: 'Larger text', 'aria-label': 'Larger text', onclick: () => zoom(1) }, icon('zoomIn')),
          ui.compare === null ? h('button', { class: 'btn ghost sm wide-only', onclick: startCompare, title: 'Put a second document beside this one' }, icon('split'), 'Compare') : null,
          h('button', { class: `btn sm ${ui.drawer === 'sheet' ? 'primary' : 'ghost'}`, onclick: () => toggleDrawer('sheet') }, icon('sheet'), h('span', { class: 'blbl' }, 'Sheet')),
          h('button', { class: `btn sm ${ui.drawer === 'notes' ? 'primary' : 'ghost'}`, onclick: () => toggleDrawer('notes') }, icon('notes'), h('span', { class: 'blbl' }, 'Notes')))),
      h('div', { class: `rd-cols ${cols.length > 1 ? 'two' : ''} ${animate ? 'enter' : ''}` }, cols),
      h('p', { class: 'rd-hint' }, 'Select text to highlight it or quote it into your notebook. Esc returns to the desk.'));
    reader.querySelectorAll('.rd-scroll').forEach(s => { s.scrollTop = 0; });
  }

  function startCompare() {
    const order = available();
    ui.compare = order[(order.indexOf(ui.reader) + 1) % order.length];
    ui.active = 1;
    renderReader();
    toast('Pick the second document from the menu above it, or with its arrows.');
  }

  function zoom(dir) {
    const i = ZOOMS.indexOf(st.ui.zoom);
    st.ui.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))];
    $$('.rd-paper', reader).forEach(p => { p.style.zoom = st.ui.zoom; });
    save();
  }

  /* --- highlights & quotes (inside the reader) ------------------------------------- */
  const selBar = h('div', { class: 'selbar', hidden: true });
  document.body.append(selBar);
  let selCtx = null;
  function hideSel() { selBar.hidden = true; selCtx = null; }
  function placeBar(rect) {
    selBar.hidden = false;
    const bw = selBar.offsetWidth, bh = selBar.offsetHeight;
    let y = rect.bottom + 8;
    if (y + bh > innerHeight - 20) y = rect.top - bh - 8;
    const x = Math.max(8, Math.min(innerWidth - bw - 8, rect.left + rect.width / 2 - bw / 2));
    selBar.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(8, y))}px)`;
  }
  const pageOf = node => { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el && el.closest('.doc[data-key]'); };

  on(document, 'selectionchange', debounce(() => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { if (selCtx && selCtx.type === 'sel') hideSel(); return; }
    const range = sel.getRangeAt(0);
    const pg = pageOf(range.commonAncestorContainer);
    if (!pg || !reader.contains(pg)) return hideSel();
    const offsets = rangeToOffsets(pg, range);
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!offsets || !text) return hideSel();
    selCtx = { type: 'sel', key: pg.dataset.key, doc: pg.dataset.doc, offsets, text };
    selBar.replaceChildren(
      h('button', { onmousedown: e => e.preventDefault(), onclick: addHighlight }, icon('marker'), 'Highlight'),
      h('button', { onmousedown: e => e.preventDefault(), onclick: quoteSelection }, icon('quote'), 'Quote to notebook'));
    placeBar(range.getBoundingClientRect());
  }, 120));

  function addHighlight() {
    if (!selCtx) return;
    const { key, offsets } = selCtx;
    const id = Date.now().toString(36);
    (st.highlights[key] ||= []).push({ s: offsets.s, e: offsets.e, id });
    $$(`.doc[data-key="${CSS.escape(key)}"]`, reader).forEach(pg => wrapRange(pg, offsets.s, offsets.e, id));
    getSelection().removeAllRanges();
    hideSel(); save(); sfx.tick();
  }

  function quoteSelection() {
    if (!selCtx) return;
    const line = `"${selCtx.text}" (${refOf(selCtx.doc)})`;
    st.notes = st.notes ? `${st.notes.replace(/\s*$/, '')}\n${line}\n` : `${line}\n`;
    const ta = drawer.querySelector('.notes-ta');
    if (ta) ta.value = st.notes;
    getSelection().removeAllRanges();
    hideSel(); save();
    toast('Quoted into the notebook');
  }

  on(reader, 'click', e => {
    const mark = e.target.closest('mark.hl');
    if (!mark || !getSelection().isCollapsed) return;
    const pg = pageOf(mark);
    selCtx = { type: 'mark', key: pg.dataset.key, id: mark.dataset.hl };
    selBar.replaceChildren(h('button', { onclick: removeHighlight }, icon('trash'), 'Remove highlight'));
    placeBar(mark.getBoundingClientRect());
  });
  on(document, 'mousedown', e => { if (!selBar.contains(e.target) && selCtx && selCtx.type === 'mark' && !e.target.closest('mark.hl')) hideSel(); });
  on(window, 'resize', hideSel);
  on(reader, 'scroll', hideSel, true);

  function removeHighlight() {
    const { key, id } = selCtx;
    st.highlights[key] = (st.highlights[key] || []).filter(x => x.id !== id);
    $$(`mark.hl[data-hl="${CSS.escape(id)}"]`, reader).forEach(mk => { const p = mk.parentNode; mk.replaceWith(...mk.childNodes); p.normalize(); });
    hideSel(); save();
  }

  /* --- phases --------------------------------------------------------------------- */
  function advancePhase() {
    if (st.phase >= m.phases.length) return;
    st.phase += 1;
    const p = m.phases[st.phase - 1];
    saveNow(); sfx.stamp();
    renderAll();
    toast(`Phase ${st.phase} is open: ${p.read}.`);
  }

  /* --- drawers: clipboard and notebook ---------------------------------------------- */
  function openDrawer(which) {
    ui.drawer = which;
    game.classList.add('drawer-open');
    drawer.hidden = false;
    drawer.className = `dw dw-${which}`;
    sfx.paper();
    drawer.replaceChildren(
      h('div', { class: 'dw-head' },
        h('b', {}, which === 'sheet' ? 'Case Resolution Sheet' : 'Notebook'),
        h('button', { class: 'iconbtn sm', 'aria-label': 'Put it down', title: 'Put it down (Esc)', onclick: closeDrawer }, icon('close'))),
      h('div', { class: 'dw-body' }, which === 'sheet' ? renderSheet() : renderNotes()));
    if (ui.reader) renderReader();
  }
  function closeDrawer() {
    ui.drawer = null;
    drawer.hidden = true;
    game.classList.remove('drawer-open');
    sfx.close();
    renderDesk();
    if (ui.reader) renderReader();
  }
  const toggleDrawer = which => (ui.drawer === which ? closeDrawer() : openDrawer(which));

  function markEarly(step) {
    if (step.early === null && step.text.trim() && step.cites.length) step.early = fileStillSplit(m, st);
  }

  function citeEditor(list, onChange) {
    const chips = h('div', { class: 'chips' });
    const draw = () => chips.replaceChildren(...list.map((c, i) => h('span', { class: 'chip' }, c,
      h('button', { class: 'chip-x', 'aria-label': `Remove ${c}`, onclick: () => { list.splice(i, 1); draw(); onChange(); } }, icon('close')))));
    const input = h('input', { class: 'cite-in', list: 'cite-list', placeholder: 'Cite, e.g. B-1', 'aria-label': 'Add a citation' });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      if (!list.some(c => c.toLowerCase() === v.toLowerCase())) list.push(v);
      input.value = ''; draw(); onChange(); sfx.tick();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    input.addEventListener('input', e => { if (e.inputType === undefined || e.inputType === 'insertReplacementText') add(); });
    draw();
    return h('div', { class: 'cites' }, h('span', { class: 'cites-l' }, 'Evidence'), chips, h('span', { class: 'cite-add' }, input, h('button', { class: 'cite-btn', onclick: add, 'aria-label': 'Add citation' }, '+')));
  }

  function renderSheet() {
    const s = st.sheet;
    const dbl = !!m.reveal.double;
    const steps = m._steps.map((q, i) => {
      const step = s.steps[i];
      const mark = h('span', { class: 'tick' });
      const refresh = () => {
        const ok = step.text.trim() && step.cites.length;
        mark.className = `tick ${ok ? 'ok' : step.text.trim() ? 'half' : ''}`;
        mark.title = ok ? `Written and cited${dbl && step.early ? ` - ${m.scoring.doubleLabel}` : ''}` : step.text.trim() ? 'Needs a citation' : 'Not started';
        mark.textContent = ok ? (dbl && step.early ? 'x2' : '✓') : '';
      };
      const changed = () => { markEarly(step); refresh(); save(); };
      refresh();
      return h('div', { class: 'form-step' },
        h('div', { class: 'form-q' }, h('span', { class: 'form-n' }, `${i + 1}.`), h('span', {}, q), mark),
        h('textarea', { class: 'hand', rows: 3, value: step.text, 'aria-label': q, oninput: e => { step.text = e.target.value; changed(); } }),
        citeEditor(step.cites, changed));
    });
    const persons = h('div', { class: 'form-step' },
      h('div', { class: 'form-q' }, h('span', {}, m.persons.label)),
      h('p', { class: 'form-hint' }, m.persons.hint),
      h('table', { class: 'form-table' }, m.persons.list.map(p => {
        const rec = s.persons[p.id];
        const sel = h('select', { class: `hand-select s-${rec.status.toLowerCase()}`, 'aria-label': `Finding for ${p.name}`, value: rec.status,
          onchange: e => { rec.status = e.target.value; e.target.className = `hand-select s-${rec.status.toLowerCase()}`; save(); sfx.tick(); } },
        m.persons.statuses.map(o => h('option', { value: o }, o)));
        return h('tr', {}, h('td', {}, h('b', {}, p.name), h('span', {}, p.role)), h('td', {}, sel), h('td', {}, citeEditor(rec.cites, save)));
      })));
    const motive = h('div', { class: 'form-step' },
      h('div', { class: 'form-q' }, h('span', {}, m.motiveLabel)),
      h('textarea', { class: 'hand', rows: 3, value: s.motive, 'aria-label': m.motiveLabel, oninput: e => { s.motive = e.target.value; save(); } }));
    return h('div', { class: 'form' },
      h('div', { class: 'form-top' }, h('span', {}, `Case ${m.number}`), h('span', {}, 'Complete before the final accusation')),
      h('p', { class: 'form-hint' }, 'Cite by document reference (B-1, D-1 §2, SLIP 03). A step with no citation scores nothing, however right it is.',
        dbl ? ' Steps marked x2 were established before the last phase opened and score double.' : ''),
      steps, persons, motive,
      h('button', { class: 'stamp-btn wide', onclick: accuse }, h('span', {}, 'Ready to accuse')));
  }

  function renderNotes() {
    const hyp = phased ? Object.entries(st.hypotheses).filter(([, v]) => v.trim()) : [];
    return h('div', { class: 'nb' },
      hyp.length ? h('div', { class: 'nb-sec' }, h('div', { class: 'nb-h' }, 'Written at the phase gates'),
        hyp.map(([k, v]) => h('p', { class: 'nb-hyp' }, h('b', {}, `Phase ${k}: `), v))) : null,
      h('textarea', { class: 'hand notes-ta', value: st.notes, 'aria-label': 'Notebook',
        placeholder: 'Timelines, hunches, arguments...\nSelect text in any document and choose "Quote to notebook" to drop it here.',
        oninput: e => { st.notes = e.target.value; save(); } }),
      st.breakthroughs.length ? h('div', { class: 'nb-sec' }, h('div', { class: 'nb-h' }, 'Breakthroughs'),
        h('ol', { class: 'bt-list' }, st.breakthroughs.map(b => h('li', {}, h('span', { class: 'mono' }, fmtClock(b.at)), b.note || 'Breakthrough')))) : null);
  }

  /* --- calculator ------------------------------------------------------------------ */
  function openCalculator() {
    sfx.tick();
    let expr = '';
    const screen = h('div', { class: 'lcd-expr' }, '0');
    const result = h('div', { class: 'lcd-res' }, '');
    const show = () => { screen.textContent = expr || '0'; const v = calc(expr); result.textContent = expr && v != null ? `= ${v}` : ''; };
    const press = k => {
      sfx.tick();
      if (k === 'C') expr = '';
      else if (k === 'DEL') expr = expr.slice(0, -1);
      else if (k === '=') { const v = calc(expr); if (v != null) expr = String(v); }
      else if (expr.length < 60) expr += k;
      show();
    };
    const keys = ['C', 'DEL', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
    const label = { '/': '÷', '*': '×', '-': '−', DEL: '⌫' };
    const dlg = modal({
      title: 'Desk calculator', className: 'calc-modal',
      body: h('div', { class: 'calculator-big' },
        h('div', { class: 'lcd' }, screen, result),
        h('div', { class: 'keys' }, keys.map(k => h('button', { class: `key ${/[0-9.]/.test(k) ? 'num' : k === '=' ? 'eq' : 'op'}`, onclick: () => press(k) }, label[k] || k))),
        h('p', { class: 'hint' }, 'Type on your keyboard too. Enter for =, Backspace to delete.')),
    });
    const onKey = e => {
      if (!document.body.contains(dlg.el)) return document.removeEventListener('keydown', onKey);
      if (/^[0-9.+\-*/()]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { press('='); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('DEL'); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'c') press('C');
    };
    document.addEventListener('keydown', onKey);
  }

  /* --- breakthrough bell ---------------------------------------------------------- */
  function logBreakthrough() {
    sfx.bell();
    const at = timerNow(st);
    const inp = h('input', { class: 'field', placeholder: 'e.g. The thermometer was in the wrong room', autofocus: true });
    const commit = () => {
      st.breakthroughs.push({ at, note: inp.value.trim() });
      saveNow();
      toast(`Breakthrough logged at ${fmtClock(at)}`);
      renderDesk();
      if (ui.drawer === 'notes') openDrawer('notes');
    };
    const dlg = modal({
      kicker: `Ding. At ${fmtClock(at)}`, title: 'What just clicked?',
      body: [inp, h('p', { class: 'hint' }, 'Optional. The debrief shows when each breakthrough happened.')],
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Log it', kind: 'primary', onClick: commit }],
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); dlg.close(); } });
  }

  /* --- authorities ------------------------------------------------------------------ */
  function spend(a) {
    const gate = authoritiesOpen(m, st);
    if (!gate.ok) { sfx.tick(); return toast(gate.why); }
    const reason = h('textarea', { class: 'field', rows: 2, placeholder: 'Point at the document that made you want this.' });
    modal({
      kicker: `Sealed Authority ${a.n} · ${a.to}`,
      title: 'Break this seal?',
      body: [
        h('p', { class: 'lead', html: a.html }),
        h('div', { class: 'callout' }, `You will have ${remaining(st) - 1} of ${st.budget} left. Authorities do not come back, and not every one returns something useful.`),
        h('label', { class: 'lbl' }, 'What in the file made you want this?', reason),
        h('p', { class: 'hint' }, 'Optional, but say it out loud. If you cannot answer, do not buy it.'),
      ],
      actions: [
        { label: 'Leave it sealed', kind: 'ghost' },
        { label: 'Spend it', kind: 'primary', icon: 'envelope', onClick: () => { doSpend(a, reason.value.trim()); } },
      ],
    });
  }

  async function doSpend(a, reason) {
    st.spent.push({ n: a.n, at: timerNow(st), reason });
    saveNow();
    renderTop();
    const opened = openEnvelope({ kicker: `Authority ${a.n}`, label: a.text, sub: `Returned by ${a.to}` });
    setTimeout(sfx.seal, 100);
    await opened;
    renderDesk();
    openReader(`SLIP ${a.n}`);
  }

  /* --- help ------------------------------------------------------------------------ */
  function showHelp() {
    const digital = [
      'Click a folder to read it. Compare puts a second document beside the first (wide screens).',
      'Select text in a document to highlight it or quote it into your notebook. Click a highlight to remove it.',
      'Click a sealed envelope to spend that Authority. Its result arrives as a folder under Returned inquiries.',
      'The clipboard holds your Resolution Sheet. Open it while reading: it docks beside the document.',
      'Ring the bell when something clicks. Click the stopwatch to pause. Progress saves automatically.',
    ];
    modal({
      kicker: `Case ${m.number} · ${m.title}`, title: 'How this works', className: 'wide',
      body: [
        h('h3', { class: 'sub' }, 'The rules'), h('ol', { class: 'rules' }, m.rules.map(r => h('li', {}, r))),
        h('h3', { class: 'sub' }, 'On the desk'), h('ul', { class: 'rules' }, digital.map(r => h('li', {}, r))),
      ],
      actions: [
        { label: 'Abandon this investigation', kind: 'ghost danger-text', close: false, onClick: async () => {
          const ok = await confirmModal({ title: 'Abandon this investigation?', body: h('p', {}, 'Your sheet, notes and spent Authorities on this device will be deleted. This cannot be undone.'), confirm: 'Delete progress', danger: true });
          if (ok) { clearState(m.id); go('#/'); }
          return ok;
        } },
        { label: 'Back to the desk', kind: 'primary' },
      ],
    });
  }

  function coach() {
    const items = [
      ['file', 'Folders', 'Every document you may read. Click one to pick it up. New ones carry a red clip.'],
      ['envelope', 'Sealed envelopes', `${st.budget} Authorities. Each breaks one seal and returns one result. They do not come back.`],
      ['sheet', 'The clipboard', 'Your Resolution Sheet. Write each step with a citation as you establish it. Only what is written scores.'],
      ['accuse', 'The red stamp', 'Accuse. Two wrong accusations are allowed; the third is final. Then Envelope S-1.'],
    ];
    if (phased) items.unshift(['lock', 'The memo', 'The file opens in phases. Answer the memo to unseal the next bundle.']);
    modal({
      kicker: 'Solo investigation', title: 'Welcome to your desk',
      body: h('ul', { class: 'coach' }, items.map(([ic, t, d]) => h('li', {}, icon(ic), h('div', {}, h('b', {}, t), h('span', {}, d))))),
      actions: [{ label: 'Start reading', kind: 'primary' }],
      onClose: () => { st.ui.coach = true; save(); },
    });
  }

  /* --- accusation ------------------------------------------------------------------- */
  function accuse() {
    sfx.tick();
    const n = st.accusations.length + 1;
    const final = n >= 3;
    const missing = st.sheet.steps.map((s, i) => [s, i + 1]).filter(([s]) => !s.text.trim() || !s.cites.length).map(([, i]) => i);
    let choice = null;
    const tried = new Set(st.accusations.map(a => a.option));
    const opts = m.accusation.options.map(o => h('label', { class: `opt ${tried.has(o.id) ? 'tried' : ''}` },
      h('input', { type: 'radio', name: 'acc', value: o.id, disabled: tried.has(o.id), onchange: () => { choice = o; dlg.buttons[1].disabled = false; } }),
      h('span', { class: 'opt-main' }, h('b', {}, o.label), h('span', { class: 'muted' }, tried.has(o.id) ? 'Already returned' : o.sub)),
      o.final ? h('span', { class: 'tag' }, 'Closes the review') : null));
    const dlg = modal({
      kicker: final ? 'Final accusation' : `Accusation ${n} of 3`,
      title: 'Charge sheet', className: 'wide charge',
      body: [
        h('p', {}, final ? 'This is your third accusation. It is final and will be scored as it stands.'
          : 'Two wrong accusations are allowed. Each costs 10 points and opens a Reconsider envelope naming the gap in your theory.'),
        missing.length
          ? h('div', { class: 'callout warn' }, `Resolution Sheet step${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'have' : 'has'} no working or no citation yet and would score nothing.`)
          : h('div', { class: 'callout ok' }, 'Every step on the Resolution Sheet has working and a citation.'),
        h('div', { class: 'acc-q' }, m.accusation.question),
        h('div', { class: 'opts' }, opts),
      ],
      actions: [
        { label: 'Back to the desk', kind: 'ghost' },
        { label: final ? 'Stamp the final accusation' : 'Stamp this accusation', kind: 'danger', disabled: true, onClick: () => { submitAccusation(choice, n); } },
      ],
    });
  }

  async function submitAccusation(o, n) {
    if (!o) return;
    sfx.stamp();
    const isFinal = n >= 3 || !o.reconsider;
    const correct = o.type === m.accusation.determination && !o.reconsider;
    st.accusations.push({ option: o.id, at: timerNow(st), n, correct, final: isFinal, reconsider: isFinal ? null : o.reconsider.id });
    if (!isFinal) {
      saveNow();
      renderTop();
      const opened = openEnvelope({ kicker: 'Accusation returned', label: o.reconsider.title, sub: '-10 points. Go back to the table.', tone: 'red', button: 'Open the Reconsider envelope' });
      setTimeout(sfx.seal, 100);
      await opened;
      renderDesk();
      openReader(o.reconsider.id);
      toast(`${plural(3 - st.accusations.length, 'accusation')} left.`);
      return;
    }
    timerStop(st);
    st.final = { option: o.id, n, at: timerNow(st), signedBy: '' };
    st.status = 'signing';
    saveNow();
    go(`#/play/${m.id}`);
  }

  /* --- keyboard -------------------------------------------------------------------- */
  on(document, 'keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('.modal-wrap, .fx-overlay')) return;
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape') {
      if (typing) { e.target.blur(); return; }
      if (ui.drawer) { closeDrawer(); return; }
      if (ui.reader) { closeReader(); return; }
    }
    if (typing || !ui.reader) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const order = available();
      const cur = ui.compare !== null && ui.active === 1 ? ui.compare : ui.reader;
      const next = order[order.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) { e.preventDefault(); openReader(next, ui.active); }
    }
  });

  /* --- go ------------------------------------------------------------------------- */
  function renderAll() { renderTop(); renderDesk(); if (ui.reader) renderReader(); }
  renderAll();
  if (!st.ui.coach) coach();

  return () => {
    clearInterval(tick); clearInterval(autosave);
    listeners.forEach(off => off());
    selBar.remove();
    document.body.classList.remove('desk-lock');
    if (st.status === 'playing' && timerRunning(st)) timerStop(st, true);
    saveState(st);
  };
}
