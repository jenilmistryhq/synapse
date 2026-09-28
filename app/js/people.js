// Persons of interest: portraits, display names, and where each person is
// mentioned in the documents a player can currently read.

import { h } from './util.js';
import { docText } from './docs.js';

// "Kovaleski, Dr Lena" -> surname "Kovaleski", shown as "Dr Lena Kovaleski".
export const surname = p => p.name.split(',')[0].trim();
export const fullName = p => {
  const [last, first] = p.name.split(',').map(s => s.trim());
  return first ? `${first} ${last}` : last;
};
const initials = p => fullName(p).split(/\s+/).filter(w => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// Portraits are drawn at build time (tools/build-portraits.js). If one is
// missing, the person's initials stand in, so a new case still plays.
export function portrait(m, p, cls = '') {
  const box = h('span', { class: `portrait ${cls}`, 'aria-hidden': 'true' });
  const img = h('img', { src: `${m.base}portraits/${p.id}.svg`, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => { box.classList.add('no-img'); box.replaceChildren(h('span', { class: 'portrait-ini' }, initials(p))); }, { once: true });
  box.append(img);
  return box;
}

// Which of the given documents name this person, and how often.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function mentions(m, reg, ids, p) {
  const re = new RegExp(`\\b${esc(surname(p))}\\b`, 'gi');
  const out = [];
  for (const id of ids) {
    const n = (docText(m, reg.get(id)).match(re) || []).length;
    if (n) out.push({ id, n });
  }
  return out;
}
