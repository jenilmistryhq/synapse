// Badges, earned when a case is scored and kept in this browser.
//
// Most badges work for every case. A case can add its own in sealed.json:
//   "badges": [{ "id": "forgery", "title": "Caught the forgery", "text": "...", "when": { "check": "c4" } }]
// "when" may name a reveal check that must have scored.

import { h, icon, modal, store, plural } from './util.js';
import { checkValue } from './scoring.js';

const KEY = 'synapse:badges';
const earned = () => { const v = store.load(KEY); return Array.isArray(v) ? v : []; };

const solved = st => st.score && st.score.correct;
const lowerTime = m => { const n = parseInt(String(m.time || ''), 10); return Number.isFinite(n) ? n * 60000 : null; };
const lines = st => (st.score && st.score.lines) || [];

// Badges that apply to every case. test(m, st) runs on a scored state.
const RUN = [
  { id: 'first', icon: 'seal', title: 'First file closed', text: 'Solve any case.', test: (m, st) => solved(st) },
  { id: 'first-time', icon: 'check', title: 'Right first time', text: 'Solve a case with your first accusation.', test: (m, st) => solved(st) && st.final.n === 1 },
  { id: 'sweep', icon: 'trophy', title: 'Clean sweep', text: 'Every step and every finding, correct first time.', test: (m, st) => lines(st).some(l => l.label === m.scoring.cleanSweep.label && l.pts > 0) },
  { id: 'paper', icon: 'sheet', title: 'Paper trail', text: 'Every step of the Resolution Sheet scored from your evidence.',
    test: (m, st) => solved(st) && m.reveal.steps.filter(s => /^step:/.test(s.sheet)).every(s => (s.checks || []).every(c => checkValue(m, st, s, c))) },
  { id: 'no-help', icon: 'bulb', title: 'No help needed', text: 'Solve a case without asking the Unit for a hint.', test: (m, st) => solved(st) && !Object.values(st.hints || {}).some(n => n > 0) },
  { id: 'thrifty', icon: 'envelope', title: 'Thrifty', text: 'Solve a case with at least half your Authorities unspent.', test: (m, st) => solved(st) && st.spent.length <= st.budget / 2 },
  { id: 'quick', icon: 'clock', title: 'Against the clock', text: "Solve a case faster than its shortest estimated time.", test: (m, st) => solved(st) && lowerTime(m) && st.final.at < lowerTime(m) },
];
// Badges across cases. test(list of solved case ids, catalog).
const CAREER = [
  { id: 'tiers', icon: 'tag', title: 'Every tier', text: 'Solve an Easy, a Medium, a Hard and an Expert case.',
    test: (ids, cat) => ['Easy', 'Medium', 'Hard', 'Expert'].every(t => cat.cases.some(c => c.tier === t && ids.includes(c.id))) },
  { id: 'casebook', icon: 'file', title: 'Casebook', text: 'Solve every case.', test: (ids, cat) => cat.cases.length > 0 && cat.cases.every(c => ids.includes(c.id)) },
];

const caseBadges = m => (m.badges || []).map(b => ({ ...b, id: `${m.id}:${b.id}`, icon: b.icon || 'eye', caseId: m.id }));

// Award what this scored run earned. Returns every badge it earned, each marked new or not.
export function awardBadges(m, st, catalog) {
  const have = earned();
  const got = [];
  for (const b of RUN) if (b.test(m, st)) got.push(b);
  for (const b of caseBadges(m)) {
    const at = b.when && b.when.check && m.reveal.steps.find(s => (s.checks || []).some(c => c.id === b.when.check));
    const ok = solved(st) && (!at || checkValue(m, st, at, at.checks.find(c => c.id === b.when.check)));
    if (ok) got.push(b);
  }
  const solvedIds = [...new Set([...have.filter(e => e.solved).map(e => e.caseId), ...(solved(st) ? [m.id] : [])])];
  if (catalog) for (const b of CAREER) if (b.test(solvedIds, catalog)) got.push(b);
  const out = got.map(b => ({ ...b, fresh: !have.some(e => e.id === b.id) }));
  const add = out.filter(b => b.fresh).map(b => ({ id: b.id, caseId: m.id, at: Date.now(), ...(b.caseId ? { title: b.title, text: b.text, icon: b.icon } : {}) }));
  if (solved(st) && !have.some(e => e.solved && e.caseId === m.id)) add.push({ id: `solved:${m.id}`, caseId: m.id, solved: true, at: Date.now() });
  if (add.length) store.save(KEY, [...have, ...add]);
  return out;
}

export const badgeRow = (list, { title = 'Badges earned' } = {}) => list.length ? h('div', { class: 'card badges-card' },
  h('div', { class: 'card-h' }, icon('trophy'), title),
  h('div', { class: 'badge-row' }, list.map(b => h('div', { class: `badge ${b.fresh ? 'fresh' : ''}`, title: b.text },
    h('span', { class: 'badge-medal' }, icon(b.icon)),
    h('span', { class: 'badge-text' }, h('b', {}, b.title), h('span', {}, b.fresh ? 'New' : b.text)))))) : null;

// Every badge there is, for the shelf. A case's own badges stay secret until earned.
export function allBadges() {
  const have = earned();
  const shared = [...RUN, ...CAREER].map(b => ({ ...b, got: have.some(e => e.id === b.id) }));
  const secret = have.filter(e => e.title).map(e => ({ ...e, got: true }));
  return [...shared, ...secret];
}

export function openShelf() {
  const all = allBadges();
  const n = all.filter(b => b.got).length;
  modal({
    kicker: 'Your casebook', title: `Badges · ${n} of ${all.length}`, className: 'wide badges-modal',
    body: h('div', {}, h('div', { class: 'badge-grid' }, all.map(b => h('div', { class: `badge ${b.got ? 'got' : 'locked'}` },
      h('span', { class: 'badge-medal' }, icon(b.got ? b.icon : 'lock')),
      h('span', { class: 'badge-text' }, h('b', {}, b.title), h('span', {}, b.text))))),
      h('p', { class: 'hint' }, 'Some cases hide a badge of their own. You will know it when you earn it.')),
    actions: [{ label: 'Close', kind: 'primary' }],
  });
}

export const badgeCount = () => earned().filter(e => !e.solved).length;
