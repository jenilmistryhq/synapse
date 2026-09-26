#!/usr/bin/env node
/**
 * SYNAPSE Stage 3.5 / 4.5 validator  -- deterministic, no model judgment.
 *
 * Runs the spec v6.0 gates plus four the spec does not have, each traced to a
 * review finding:
 *
 *   C6  ANTI-SWEEP        elimination edges must carry prerequisites, so the case
 *                         cannot be solved by collecting clearing cards.
 *   C7  KEYSTONE          the declared keystone fact must be a genuine ancestor of
 *                         the accusing edge -- i.e. the central insight is not
 *                         bypassable by some cheaper route.
 *   C8  SIGNPOSTING       every action-gated node must be pointed at by something
 *                         in the base dossier. No action is a blind guess.
 *   C9  ACTION SOLVENCY   the minimum winning set must fit inside the smallest
 *                         action budget at the table.
 *
 * Usage: node tools/validate.js cases/SYN-MVP-001/ledger.json
 */

const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node tools/validate.js <ledger.json>'); process.exit(2); }
const L = JSON.parse(fs.readFileSync(path, 'utf8'));

const fail = [];
const warn = [];
const note = (a, m) => a.push(m);

const evNodes = L.canonical_evidence_nodes;
const evIds = new Set(evNodes.map(n => n.evidence_id));
const edges = L.canonical_dag_edges;
const suspects = L.canonical_suspects;
const culprit = L.solution_shape.culprit;

/* ---- C1  evidence resolution -------------------------------------------- */
for (const e of edges)
  for (const f of e.from)
    if (!evIds.has(f)) note(fail, `C1 ${e.id}: cites unknown evidence ${f}`);

/* ---- C2/C4  reachability + depth ---------------------------------------- */
const have = new Set();
const depth = new Map();
const levels = [];
let pending = [...edges];

for (let round = 1; pending.length && round < 64; round++) {
  const ready = pending.filter(e => e.requires.every(r => have.has(r)));
  if (!ready.length) break;
  const targets = [];
  for (const e of ready) {
    const outs = [].concat(e.to, e.implicates || []);
    for (const t of outs) targets.push(t);
    // an opportunity edge also establishes the addressable "<suspect>/opportunity" fact
    if (e.relation === 'opportunity')
      targets.push(`${[].concat(e.to)[0]}/opportunity`);
    depth.set(e.id, round);
  }
  targets.forEach(t => have.add(t));
  levels.push(ready.map(e => e.id));
  pending = pending.filter(e => !ready.includes(e));
}
if (pending.length)
  note(fail, `C4 unreachable edges (requires never satisfiable): ${pending.map(e => e.id).join(', ')}`);

const maxDepth = Math.max(0, ...depth.values());

/* ---- C3  elimination coverage ------------------------------------------- */
for (const s of suspects) {
  if (s.suspect_id === culprit) continue;
  const el = edges.filter(e => /^eliminates/.test(e.relation) && [].concat(e.to).includes(`suspect:${s.suspect_id}`));
  if (!el.length) note(fail, `C3 ${s.suspect_id} (${s.name}) has no elimination edge -- more than one live suspect`);
}

/* ---- C5  verdict integrity ---------------------------------------------- */
if (edges.some(e => /^eliminates/.test(e.relation) && [].concat(e.to).includes(`suspect:${culprit}`)))
  note(fail, `C5 culprit ${culprit} carries an elimination edge`);
if (!edges.some(e => e.relation === 'alibi_contradiction' && [].concat(e.to).includes(`suspect:${culprit}`)))
  note(fail, `C5 culprit ${culprit} has no alibi_contradiction edge`);

/* ---- C6  ANTI-SWEEP ------------------------------------------------------ */
const freeElims = edges.filter(e => /^eliminates/.test(e.relation) && e.requires.length === 0);
const tutorial = suspects.filter(s => s.elimination_type === 'single_free').map(s => `suspect:${s.suspect_id}`);
for (const e of freeElims) {
  const t = [].concat(e.to)[0];
  if (!tutorial.includes(t))
    note(fail, `C6 ${e.id} clears ${t} with zero prerequisites and is not a declared tutorial elimination -- enables the sweep`);
}
if (freeElims.length > 1)
  note(fail, `C6 ${freeElims.length} zero-prerequisite eliminations; at most one (the tutorial) is permitted`);
if (!edges.some(e => e.relation === 'eliminates_by_conjunction'))
  note(warn, `C6 no eliminates_by_conjunction edge -- every innocent is clearable by a single card`);

/* ---- C7  KEYSTONE -------------------------------------------------------- */
// Walk back from the accusing (alibi_contradiction) edge and collect every fact
// the chain actually depends on. The keystone must appear in that closure.
const keystone = L.solution_shape.keystone_fact;
if (keystone) {
  const producers = new Map();
  for (const e of edges) for (const t of [].concat(e.to)) {
    if (!producers.has(t)) producers.set(t, []);
    producers.get(t).push(e);
  }
  const closure = new Set();
  const walk = (factOrSuspect) => {
    if (closure.has(factOrSuspect)) return;
    closure.add(factOrSuspect);
    for (const e of producers.get(factOrSuspect) || []) e.requires.forEach(walk);
  };
  const accus = edges.filter(e => e.relation === 'alibi_contradiction');
  accus.forEach(e => e.requires.forEach(walk));
  if (!closure.has(keystone))
    note(fail, `C7 keystone ${keystone} is NOT an ancestor of the accusation -- the central insight is bypassable`);

  // and it must gate every non-tutorial elimination too
  for (const s of suspects) {
    if (s.suspect_id === culprit || s.elimination_type === 'single_free') continue;
    const c2 = new Set();
    const walk2 = (f) => { if (c2.has(f)) return; c2.add(f); for (const e of producers.get(f) || []) e.requires.forEach(walk2); };
    edges.filter(e => /^eliminates/.test(e.relation) && [].concat(e.to).includes(`suspect:${s.suspect_id}`))
         .forEach(e => e.requires.forEach(walk2));
    if (!c2.has(keystone))
      note(warn, `C7 ${s.suspect_id} can be cleared without reaching the keystone (${keystone})`);
  }
}

/* ---- C8  SIGNPOSTING ----------------------------------------------------- */
for (const n of evNodes.filter(n => n.tier === 'action_gated')) {
  const pointer = n.signpost || n.design_note;
  if (!pointer) note(fail, `C8 ${n.evidence_id} is action-gated with no signpost in the base dossier -- players would be guessing`);
  if (!n.unlock_action) note(fail, `C8 ${n.evidence_id} is action-gated but names no unlock_action`);
}
const deckIds = new Set((L.investigation_actions?.deck || []).map(a => a.id));
for (const n of evNodes.filter(n => n.unlock_action))
  if (!deckIds.has(n.unlock_action)) note(fail, `C8 ${n.evidence_id} unlocks via ${n.unlock_action}, absent from the action deck`);

/* ---- C9  ACTION SOLVENCY ------------------------------------------------- */
const ia = L.investigation_actions;
if (ia) {
  const minSet = ia.minimum_winning_set || [];
  const budgets = Object.entries(ia.budget_this_case || {});
  const smallest = Math.min(...budgets.map(([, v]) => v));
  if (minSet.length > smallest)
    note(fail, `C9 minimum winning set needs ${minSet.length} actions; smallest budget is ${smallest} -- case is unwinnable solo`);
  const slack = smallest - minSet.length;
  if (slack > 3) note(warn, `C9 slack of ${slack} spare actions at the tightest table -- the clock may not bite`);
  for (const a of minSet) if (!deckIds.has(a)) note(fail, `C9 minimum winning set names ${a}, absent from deck`);
}

/* ---- C10 tier conformance ------------------------------------------------ */
const tm = L.tier_measurement || {};
const band = tm.spec_v6_band || tm.spec_v6_medium_band || {};
const tierRows = [
  ['suspects', tm.suspects, band.suspects],
  ['base dossier nodes', tm.base_dossier_evidence_nodes, band.evidence_nodes],
  ['red herrings', tm.red_herrings, band.red_herrings],
  ['cross-suspect edges', tm.cross_suspect_corroboration_edges, band.cross_suspect],
  ['max requires depth', maxDepth, band.max_depth],
];

/* ---- report -------------------------------------------------------------- */
const H = (s) => `\n\x1b[1m${s}\x1b[0m`;
console.log(H(`SYNAPSE VALIDATOR  --  ${L.case_id}  "${L.case_title}"  [${L.difficulty_tier}]`));

console.log(H('RESOLUTION ORDER (each line is one inference round)'));
levels.forEach((lv, i) => console.log(`  ${String(i + 1).padStart(2)}. ${lv.join('  ')}`));

console.log(H('TIER CONFORMANCE  (measured vs spec v6.0 band)'));
const accepted = new Set(tm.tier_deviations_accepted || []);
const keyFor = { 'max requires depth': 'max_requires_chain_depth' };
for (const [k, got, want] of tierRows) {
  let ok = want === undefined ? '?' :
    (typeof want === 'string' && want.includes('-')
      ? (got >= +want.split('-')[0] && got <= +want.split('-')[1] ? 'PASS' : 'FAIL')
      : (got === want ? 'PASS' : 'FAIL'));
  if (ok === 'FAIL' && accepted.has(keyFor[k])) {
    ok = 'DECL';
    note(warn, `C10 ${k}: ${got} vs band ${want} -- declared deviation, accepted`);
  } else if (ok === 'FAIL') {
    note(fail, `C10 ${k}: measured ${got}, band ${want}, not declared as a deviation`);
  }
  console.log(`  ${ok.padEnd(5)} ${k.padEnd(22)} measured ${String(got).padEnd(4)} band ${want}`);
}

console.log(H('ANTI-CHEESE'));
console.log(`  zero-prerequisite eliminations : ${freeElims.length} (${freeElims.map(e => [].concat(e.to)[0]).join(', ') || 'none'})`);
console.log(`  conjunction eliminations       : ${edges.filter(e => e.relation === 'eliminates_by_conjunction').length}`);
console.log(`  keystone fact                  : ${keystone || '(not declared)'}`);

console.log(H('VERDICT'));
warn.forEach(w => console.log(`  \x1b[33mWARN\x1b[0m  ${w}`));
fail.forEach(f => console.log(`  \x1b[31mFAIL\x1b[0m  ${f}`));
if (!fail.length) console.log('  \x1b[32mPASS\x1b[0m  all gates satisfied' + (warn.length ? ` (${warn.length} warning${warn.length > 1 ? 's' : ''})` : ''));
console.log('');
process.exit(fail.length ? 1 : 0);
