// Objective scoring: a reveal check with an "auto" rule is worked out from the
// Resolution Sheet instead of being ticked by the player.
//
//   "auto": { "cites": [["B-1"], ["A-1", "D-1"]] }        a sheet step: written, and
//            each group satisfied by at least one citation
//   "auto": { "person": "pryce", "status": "Eliminated", "cites": [["SLIP 03"]] }
//   "auto": { "motive": true }                              something written as motive
//
// A citation of an Authority result (SLIP 03) only counts if that Authority was spent.
// What is written is not judged; the evidence is.

// "d-1 §2", "D-1.2", "E-1A", "slip 3", "Authority 03" -> "D-1", "D-1", "E-1A", "SLIP 03", "SLIP 03"
export function normCite(c) {
  const t = String(c || '').trim().toUpperCase().replace(/^AUTHORITY\s*/, 'SLIP ');
  const slip = /^SLIP\s*0*(\d{1,2})\b/.exec(t);
  if (slip) return `SLIP ${slip[1].padStart(2, '0')}`;
  const ref = /^([A-Z]+-\d+[A-Z]?)\b/.exec(t);
  return ref ? ref[1] : t.split(/[\s§(,;:]/)[0];
}

const stepIndex = sheet => (/^step:(\d+)$/.exec(sheet || '') || [])[1];

// { ok, why } for one check, or null when the check has no rule (ticked by hand).
export function judge(m, st, step, check) {
  const a = check.auto;
  if (!a) return null;
  const spent = new Set(st.spent.map(s => `SLIP ${s.n}`));
  const counted = list => list.map(normCite).filter(c => !c.startsWith('SLIP ') || spent.has(c));
  const unspent = list => list.map(normCite).filter(c => c.startsWith('SLIP ') && !spent.has(c));
  const groups = a.cites || [];
  const meet = (cites, label) => {
    const have = counted(cites);
    const missing = groups.filter(g => !g.some(x => have.includes(normCite(x))));
    if (!missing.length) return { ok: true, why: groups.length ? `${label} cites ${[...new Set(have.filter(c => groups.flat().map(normCite).includes(c)))].join(', ')}.` : `${label} is written.` };
    const lost = unspent(cites).filter(c => missing.some(g => g.map(normCite).includes(c)));
    return { ok: false, why: lost.length ? `${lost.join(', ')} was cited but that Authority was never opened.` : `Needs a citation of ${missing.map(g => g.join(' or ')).join(', and of ')}.` };
  };
  if (a.motive) {
    return st.sheet.motive.trim() ? { ok: true, why: 'A motive is written on your sheet.' } : { ok: false, why: 'No motive was written.' };
  }
  if (a.person) {
    const rec = st.sheet.persons[a.person];
    const want = [].concat(a.status || []);
    if (!rec || (want.length && !want.includes(rec.status))) return { ok: false, why: `Your sheet records them as ${rec ? rec.status : 'Open'}, not ${want.join(' or ')}.` };
    return meet(rec.cites, 'Your finding');
  }
  const i = stepIndex(step.sheet);
  const s = i != null && st.sheet.steps[+i];
  if (!s || !s.text.trim()) return { ok: false, why: 'Nothing was written for this step.' };
  return meet(s.cites, 'Your answer');
}

// The value a check counts as: the rule's verdict, or the player's tick.
export function checkValue(m, st, step, check) {
  const j = judge(m, st, step, check);
  return j ? j.ok : !!st.reveal.checks[check.id];
}
