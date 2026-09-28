// The tutorial guide: a small card on the desk with one task at a time. It
// watches the game state and moves on by itself when a task is done.
//
// A case turns it on with "tutorial" in digital.json:
//   { intro, handover, tasks: [...], full: [...] }
// "tasks" teach each tool once; "full" carries on to the accusation. The player
// picks the mode on the setup page (st.setup.guide):
//   "mixed"  the tasks, then the case is theirs (they can ask to keep going)
//   "full"   tasks and full, right to the accusation
//   "off"    no guide
// Each task: { id, text, sel, done } where done is one of
//   { read: "A-1" } { highlight: true } { step: 1 } { spent: true } { spentN: "03" }
//   { person: "lark", status: "Eliminated" } { cited: ["lark"] } { accused: true }

import { h, icon } from './util.js';

export const GUIDE_MODES = [
  ['mixed', 'Guided, then free (recommended)', 'I show you each tool once, then the case is yours.'],
  ['full', 'Fully guided', 'Step by step, all the way to the accusation.'],
  ['off', 'No guidance', 'Just the file and the desk tour.'],
];

function isDone(t, st) {
  const d = t.done || {};
  if (d.read) return !!st.read[d.read];
  if (d.highlight) return Object.values(st.highlights).some(list => list && list.length);
  if (d.step != null) { const s = st.sheet.steps[d.step]; return !!(s && s.text.trim() && s.cites.length); }
  if (d.spentN) return st.spent.some(s => s.n === d.spentN);
  if (d.spent) return st.spent.length > 0;
  if (d.person) return (st.sheet.persons[d.person] || {}).status === d.status;
  if (d.cited) return d.cited.every(id => ((st.sheet.persons[id] || {}).cites || []).length > 0);
  if (d.accused) return st.accusations.length > 0;
  return false;
}

export function mountGuide({ m, st, save, host }) {
  const T = m.tutorial;
  if (!T || !st.setup.guide || st.setup.guide === 'off') return { destroy() {} };
  st.guide ||= { skipped: [], handed: false, dismissed: false };
  const G = st.guide;

  const card = h('aside', { class: 'guide', 'aria-label': 'Guide', 'aria-live': 'polite' });
  host.append(card);
  let lastKey = '';

  const list = () => (st.setup.guide === 'full' ? [...T.tasks, ...(T.full || [])] : T.tasks);
  const open = () => list().filter(t => !G.skipped.includes(t.id) && !isDone(t, st));

  function showMe(t) {
    const el = t.sel.split(',').map(s => document.querySelector(s.trim())).find(x => x && x.offsetParent !== null);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    el.classList.remove('guide-flash'); void el.offsetWidth; el.classList.add('guide-flash');
    setTimeout(() => el.classList.remove('guide-flash'), 2600);
  }
  const setMode = mode => { st.setup.guide = mode; G.dismissed = mode === 'off'; save(); update(true); };

  // The card can shrink to its title line so it never hides what it points at.
  const minBtn = () => h('button', { class: 'iconbtn sm', 'aria-label': G.min ? 'Expand the guide' : 'Minimise the guide', title: G.min ? 'Expand' : 'Minimise',
    onclick: () => { G.min = !G.min; save(); update(true); } }, icon(G.min ? 'expand' : 'minus'));

  function draw(state) {
    const all = list();
    card.classList.toggle('min', !!G.min);
    if (state.kind === 'task') {
      const t = state.task;
      const n = all.indexOf(t) + 1;
      card.replaceChildren(
        h('div', { class: 'guide-top' }, h('span', { class: 'guide-k' }, icon('help'), `Guide · ${n} of ${all.length}`),
          h('span', { class: 'guide-btns' }, minBtn(),
            h('button', { class: 'iconbtn sm', 'aria-label': 'Stop guiding me', title: 'Stop guiding me', onclick: () => setMode('off') }, icon('close')))),
        n === 1 && T.intro ? h('p', { class: 'guide-intro' }, T.intro) : null,
        h('p', { class: 'guide-text' }, t.text),
        h('div', { class: 'guide-act' },
          h('button', { class: 'btn sm primary', onclick: () => showMe(t) }, icon('eye'), 'Show me'),
          h('button', { class: 'linkbtn', onclick: () => { G.skipped.push(t.id); save(); update(true); } }, 'Skip this step')),
        h('div', { class: 'guide-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(((n - 1) / all.length) * 100)}%` } })));
    } else if (state.kind === 'handover') {
      card.replaceChildren(
        h('div', { class: 'guide-top' }, h('span', { class: 'guide-k' }, icon('check'), 'You know the desk')),
        h('p', { class: 'guide-text' }, T.handover),
        h('div', { class: 'guide-act' },
          h('button', { class: 'btn sm primary', onclick: () => { G.handed = true; setMode('off'); } }, "I'll take it from here"),
          T.full && T.full.length ? h('button', { class: 'btn sm ghost', onclick: () => { G.handed = true; setMode('full'); } }, 'Keep guiding me') : null));
    } else {
      card.replaceChildren(
        h('div', { class: 'guide-top' }, h('span', { class: 'guide-k' }, icon('check'), 'All done'),
          h('button', { class: 'iconbtn sm', 'aria-label': 'Close the guide', onclick: () => setMode('off') }, icon('close'))),
        h('p', { class: 'guide-text' }, 'That is everything. Read Envelope S-1 carefully when it opens: it shows how each step could be proved.'));
    }
  }

  function update(force = false) {
    if (st.setup.guide === 'off') { card.hidden = true; return; }
    // Wait for the desk tour to finish before the first task.
    card.hidden = !!document.querySelector('.tour-card');
    const todo = open();
    const state = todo.length ? { kind: 'task', task: todo[0] }
      : st.setup.guide === 'mixed' && !G.handed ? { kind: 'handover' } : { kind: 'done' };
    const key = state.kind + (state.task ? state.task.id : '');
    if (!force && key === lastKey) return;
    lastKey = key;
    draw(state);
  }

  const onEvent = () => setTimeout(update, 60);
  document.addEventListener('click', onEvent, true);
  document.addEventListener('input', onEvent, true);
  const timer = setInterval(update, 800);
  update(true);
  return {
    update,
    destroy() { clearInterval(timer); document.removeEventListener('click', onEvent, true); document.removeEventListener('input', onEvent, true); card.remove(); },
  };
}
