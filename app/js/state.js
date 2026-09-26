// Game state: one saved solo investigation per case, kept in localStorage.

import { store } from './util.js';

const VERSION = 2;
const key = id => `synapse:${id}:v${VERSION}`;

export function loadState(id) {
  const st = store.load(key(id));
  return st && st.v === VERSION ? st : null;
}

export function saveState(st) {
  st.savedAt = Date.now();
  if (!store.save(key(st.caseId), st)) console.warn('[synapse] could not save progress');
}

export function clearState(id) { store.remove(key(id)); }

export function newState(m, { phased }) {
  return {
    v: VERSION,
    caseId: m.id,
    createdAt: Date.now(),
    status: 'briefing',
    setup: { phased: !!phased && !!m.phases },
    firstAttempt: !hasSeenSolution(m.id),
    budget: m.budget['1'],
    spent: [],
    read: {},
    highlights: {},
    notes: '',
    phase: 1,
    hypotheses: {},
    breakthroughs: [],
    sheet: {
      steps: m._steps.map(() => ({ text: '', cites: [], early: null })),
      persons: Object.fromEntries(m.persons.list.map(p => [p.id, { status: 'Open', cites: [] }])),
      motive: '',
    },
    accusations: [],
    final: null,
    reveal: { i: 0, checks: {}, doubles: {} },
    timer: { elapsed: 0, since: null, auto: false },
    ui: { panes: ['BRIEF'], active: 0, tab: 'inquiries', zoom: 1, coach: false },
  };
}

/* --- timer ---------------------------------------------------------------- */
export const timerNow = st => st.timer.elapsed + (st.timer.since ? Date.now() - st.timer.since : 0);
export const timerRunning = st => !!st.timer.since;

export function timerStart(st) { if (!st.timer.since) st.timer.since = Date.now(); st.timer.auto = false; }
export function timerStop(st, auto = false) {
  if (st.timer.since) { st.timer.elapsed = timerNow(st); st.timer.since = null; st.timer.auto = auto; }
}
export function timerRebase(st) {
  if (st.timer.since) { st.timer.elapsed = timerNow(st); st.timer.since = Date.now(); }
}

/* --- rules helpers -------------------------------------------------------- */
export const isPhased = (m, st) => !!(st.setup.phased && m.phases);

// Is the file still in pieces? (Where a case doubles early steps, they score x2.)
export function fileStillSplit(m, st) {
  return !!(m.reveal.double && isPhased(m, st) && st.phase < m.phases.length);
}

export function authoritiesOpen(m, st) {
  if (isPhased(m, st) && !m.phases[st.phase - 1].authorities) {
    return { ok: false, why: `Authorities open in Phase ${m.phases.findIndex(p => p.authorities) + 1}.` };
  }
  if (st.spent.length >= st.budget) return { ok: false, why: 'Every Authority has been spent.' };
  return { ok: true };
}

export const remaining = st => st.budget - st.spent.length;
export const wrongCount = st => st.accusations.filter(a => !a.correct && !a.final).length;

/* --- first-attempt tracking (for the leaderboard) -------------------------- */
const seenKey = 'synapse:revealed';
export const hasSeenSolution = id => (store.load(seenKey) || []).includes(id);
export function markSolutionSeen(id) {
  const list = store.load(seenKey) || [];
  if (!list.includes(id)) { list.push(id); store.save(seenKey, list); }
}
