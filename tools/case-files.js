// A case is two files. digital.json is everything the game needs while you play;
// sealed.json holds the answers, and the browser only fetches it once you accuse.
//
//   sealed.json: { determination, options: { <optionId>: { type, reconsider? } },
//                  reveal, scoring, replay, debrief }
//
// Node tools read a case through readCase(), which merges the two, so they see the
// same complete manifest the game has after the accusation.

const fs = require('fs');
const path = require('path');

// The answer-bearing parts of a manifest. They must not appear in digital.json.
const SEALED_KEYS = ['reveal', 'scoring', 'replay', 'debrief', 'badges'];

function merge(m, s) {
  if (!s) return m;
  m.accusation.determination = s.determination;
  for (const o of m.accusation.options) Object.assign(o, (s.options || {})[o.id] || {});
  for (const k of SEALED_KEYS) if (s[k] !== undefined) m[k] = k === 'reveal' || k === 'scoring' ? { ...(m[k] || {}), ...s[k] } : s[k];
  return m;
}

function readCase(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'digital.json'), 'utf8'));
  const sp = path.join(dir, 'sealed.json');
  return merge(m, fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null);
}

// What in a public manifest would give the game away (empty when it is clean).
function leaks(m) {
  const out = [];
  if (m.accusation && m.accusation.determination) out.push('accusation.determination');
  for (const o of (m.accusation && m.accusation.options) || []) {
    if (o.type) out.push(`option ${o.id}: type`);
    if (o.reconsider) out.push(`option ${o.id}: reconsider`);
  }
  if (m.reveal && Object.keys(m.reveal).some(k => k !== 'double')) out.push('reveal');
  if (m.scoring && Object.keys(m.scoring).some(k => k !== 'doubleLabel')) out.push('scoring');
  for (const k of ['replay', 'debrief', 'badges']) if (m[k]) out.push(k);
  return out;
}

// JSON with short objects and arrays kept on one line, so case files stay readable.
function pretty(v, indent = '') {
  const one = JSON.stringify(v);
  if (one.length + indent.length <= 110 || v === null || typeof v !== 'object') return one.replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\},\{/g, '}, {');
  const next = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map(x => next + pretty(x, next)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${pretty(x, next)}`).join(',\n')}\n${indent}}`;
}

module.exports = { readCase, merge, leaks, pretty, SEALED_KEYS };

// node tools/case-files.js split <caseId>   moves the answers out of digital.json
if (require.main === module && process.argv[2] === 'split') {
  const dir = path.join(__dirname, '..', 'cases', process.argv[3]);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'digital.json'), 'utf8'));
  if (fs.existsSync(path.join(dir, 'sealed.json'))) { console.log('already split'); process.exit(0); }
  const sealed = { determination: m.accusation.determination, options: {} };
  delete m.accusation.determination;
  for (const o of m.accusation.options) {
    sealed.options[o.id] = { type: o.type, ...(o.reconsider ? { reconsider: o.reconsider } : {}) };
    delete o.type; delete o.reconsider;
  }
  for (const k of SEALED_KEYS) if (m[k] !== undefined) { sealed[k] = m[k]; delete m[k]; }
  // Two harmless display settings the desk needs while you play (Case 02's double steps).
  if (sealed.reveal && sealed.reveal.double) m.reveal = { double: true };
  if (sealed.scoring && sealed.scoring.doubleLabel) m.scoring = { doubleLabel: sealed.scoring.doubleLabel };
  // keep the key order of the original file, with the public parts only
  fs.writeFileSync(path.join(dir, 'digital.json'), pretty(m) + '\n');
  fs.writeFileSync(path.join(dir, 'sealed.json'), pretty(sealed) + '\n');
  console.log(`${process.argv[3]}: answers moved to sealed.json; digital.json leaks: ${leaks(m).join(', ') || 'none'}`);
}
