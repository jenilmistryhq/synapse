#!/usr/bin/env node
// Draws a portrait for every person of interest in every case, once, at build
// time. The SVGs are committed with the case (cases/<id>/portraits/<person>.svg),
// so the site never calls a third party to show a face.
//
// Art: "Open Peeps" by Pablo Stanley (CC0 1.0), assembled with DiceBear (MIT).
// Each person can set a "look" in digital.json to match the documents; anything
// left out is picked from a seed, so the same person always gets the same face.
//
//   "look": { "head": "bun", "face": "calm", "accessories": "glasses",
//             "facialHair": "moustache3", "skin": "ffdbb4", "hair": "724133", "clothing": "7d8ba3" }
//
// Faces are kept neutral on purpose: an expression must never give the case away.
//
// Heads, faces and the rest: node -e "console.log(require('@dicebear/collection').openPeeps.schema.properties.head.items.enum)"
//
// Usage:  node tools/build-portraits.js [caseId ...]

const fs = require('fs');
const path = require('path');
const { createAvatar } = require('@dicebear/core');
const { openPeeps } = require('@dicebear/collection');

const ROOT = path.join(__dirname, '..');
const CASES = path.join(ROOT, 'cases');
const NEUTRAL_FACES = ['calm', 'serious', 'solemn', 'tired', 'concerned', 'explaining', 'blank'];
const CLOTHING = ['7d8ba3', '8a9a8c', 'a8896c', '9c7b7b', 'b8a88a', '6f7f73', '8c8198'];

function hash(s) { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0; return x; }
const pick = (list, seed) => list[hash(seed) % list.length];

function portrait(caseId, person) {
  const look = person.look || {};
  const seed = `${caseId}:${person.id}`;
  const opts = {
    seed,
    face: [look.face || pick(NEUTRAL_FACES, seed)],
    clothingColor: [look.clothing || pick(CLOTHING, seed + ':c')],
    facialHairProbability: look.facialHair ? 100 : 0,
    accessoriesProbability: look.accessories ? 100 : 0,
    maskProbability: 0,
  };
  if (look.head) opts.head = [look.head];
  if (look.facialHair) opts.facialHair = [look.facialHair];
  if (look.accessories) opts.accessories = [look.accessories];
  if (look.skin) opts.skinColor = [look.skin];
  if (look.hair) opts.headContrastColor = [look.hair];
  return createAvatar(openPeeps, opts).toString().replace(/[“”„]/g, '"'); // keep the files plain ASCII
}

const only = process.argv.slice(2);
let wrote = 0;
for (const id of fs.readdirSync(CASES).sort()) {
  const file = path.join(CASES, id, 'digital.json');
  if (!fs.existsSync(file) || (only.length && !only.includes(id))) continue;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = path.join(CASES, id, 'portraits');
  fs.mkdirSync(out, { recursive: true });
  for (const p of m.persons.list) {
    if (!/^[a-z0-9-]+$/.test(p.id)) throw new Error(`${id}: person id "${p.id}" must be lowercase letters, digits or hyphens`);
    if (!p.look) console.warn(`  ${id}/${p.id}: no "look" set, using a seeded face`);
    fs.writeFileSync(path.join(out, `${p.id}.svg`), portrait(id, p));
    wrote++;
  }
  console.log(`${id}: ${m.persons.list.length} portraits`);
}
console.log(`Wrote ${wrote} portraits.`);
