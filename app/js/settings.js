// Player settings, kept in this browser: sound, document text size, motion,
// colour-blind-friendly colours and plain text instead of handwriting.

import { h, modal, store, toast } from './util.js';
import { soundOn, setSound, sfx } from './sfx.js';
import { detectiveKey, formatKey, setDetectiveKey } from './leaderboard.js';

const KEY = 'synapse:settings';
export const DOC_SIZES = [['0.8', 'Small'], ['0.9', 'Smaller'], ['1', 'Normal'], ['1.1', 'Larger'], ['1.25', 'Large'], ['1.4', 'Extra large'], ['1.6', 'Huge']];
const DEFAULTS = { docZoom: 1, reduceMotion: false, colourSafe: false, plainHand: false };

export function getSettings() { return { ...DEFAULTS, ...(store.load(KEY) || {}) }; }
export function setSetting(k, v) { const s = getSettings(); s[k] = v; store.save(KEY, s); applySettings(); }

// Reflect settings as classes on <body>, so plain CSS can respond.
export function applySettings() {
  const s = getSettings();
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.body.classList.toggle('colour-safe', !!s.colourSafe);
  document.body.classList.toggle('plain-hand', !!s.plainHand);
}

export const motionReduced = () => getSettings().reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function openSettings({ onChange } = {}) {
  const s = getSettings();
  const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', {}, h('b', {}, label), hint ? h('span', {}, hint) : null), control);
  const toggle = (on, fn, name) => {
    const input = h('input', { type: 'checkbox', checked: on, role: 'switch', 'aria-label': name });
    input.addEventListener('change', () => { fn(input.checked); if (onChange) onChange(); });
    return h('label', { class: 'switch' }, input, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }));
  };
  const size = h('select', { class: 'field set-select', 'aria-label': 'Document text size' }, DOC_SIZES.map(([v, l]) => h('option', { value: v }, l)));
  size.value = String(s.docZoom);
  size.addEventListener('change', () => { setSetting('docZoom', parseFloat(size.value)); if (onChange) onChange(); });

  // The detective key proves a leaderboard name is yours. It is shown, copied and
  // replaced here; it never appears on the leaderboard.
  function keyRow() {
    const code = h('code', { class: 'key-code' }, formatKey(detectiveKey()));
    const input = h('input', { class: 'field key-in', hidden: true, placeholder: 'xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx', 'aria-label': 'Detective key from another device', spellcheck: 'false', autocomplete: 'off' });
    const msg = h('span', { class: 'key-msg', 'aria-live': 'polite' });
    const use = h('button', { class: 'btn sm ghost', onclick: () => {
      if (input.hidden) { input.hidden = false; input.focus(); use.textContent = 'Save key'; return; }
      if (!setDetectiveKey(input.value)) { msg.textContent = 'That is not a detective key. It has 32 letters and digits.'; return; }
      code.textContent = formatKey(detectiveKey()); input.value = ''; input.hidden = true; use.textContent = 'Use a key from another device';
      msg.textContent = 'Saved. Scores from this browser now post under that key.';
    } }, 'Use a key from another device');
    const copy = h('button', { class: 'btn sm', onclick: async () => {
      try { await navigator.clipboard.writeText(formatKey(detectiveKey())); msg.textContent = 'Copied.'; } catch { msg.textContent = 'Select the key and copy it.'; }
    } }, 'Copy');
    return h('div', { class: 'set-row key-row' },
      h('div', {}, h('b', {}, 'Detective key'),
        h('span', {}, 'Proves your leaderboard name is yours. To post under the same name on another device, copy this key there. Keep it private.')),
      h('div', { class: 'key-box' }, code, h('div', { class: 'key-acts' }, copy, use), input, msg));
  }

  modal({
    kicker: 'Settings', title: 'How the game looks and sounds', className: 'settings-modal',
    body: h('div', { class: 'settings' },
      row('Sound effects', 'Paper, seals, stamps and the bell.', toggle(soundOn(), v => { setSound(v); if (v) sfx.tick(); }, 'Sound effects')),
      row('Document text size', 'The reader\'s zoom buttons change this too.', size),
      row('Reduce animations', 'Fewer moving parts: no card lifts, spins or stamps.', toggle(s.reduceMotion, v => setSetting('reduceMotion', v), 'Reduce animations')),
      row('Colour-blind friendly colours', 'Blue and orange instead of green and red for findings and results.', toggle(s.colourSafe, v => setSetting('colourSafe', v), 'Colour-blind friendly colours')),
      row('Plain text instead of handwriting', 'Your notes and sheet entries in a clear typeface.', toggle(s.plainHand, v => setSetting('plainHand', v), 'Plain text instead of handwriting')),
      keyRow(),
      h('p', { class: 'hint' }, 'Settings are saved in this browser. To make everything on screen bigger, use your browser zoom (Ctrl and +, or Cmd and + on a Mac).')),
    actions: [
      { label: 'Reset to defaults', kind: 'ghost', onClick: () => {
        store.remove(KEY); setSound(true); applySettings(); if (onChange) onChange(); toast('Settings reset');
      } },
      { label: 'Done', kind: 'primary' },
    ],
  });
}
