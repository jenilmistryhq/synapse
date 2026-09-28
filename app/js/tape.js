// Interview tapes: a transcript read aloud by the device's own text-to-speech
// (the Web Speech API), one voice per speaker, lighting up the line being read.
// Nothing is downloaded and nothing leaves the browser.
//
// A case can say which speakers sound female ("f") or male ("m") in digital.json;
// everyone else ("n", the default) gets a neutral voice. Only the pronouns the
// documents use decide this:  "voices": { "VM": "f", "OP": "m" }

import { h, icon } from './util.js';
import { motionReduced } from './settings.js';

export const tapeSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
export const hasTranscript = root => !!root.querySelector('.q .spk, .a .spk');

const FEMALE = /zira|susan|hazel|samantha|karen|moira|tessa|serena|victoria|fiona|libby|sonia|aria|jenny|emma|catherine|linda|kate|female/i;
const MALE = /david|mark|george|daniel|alex|fred|ryan|guy|thomas|james|oliver|arthur|richard|christopher|eric|brian|male/i;
const RATES = [0.85, 1, 1.15, 1.3];

// Some online voices stop after about 15 seconds, so long answers are spoken
// a sentence or two at a time.
function chunks(text) {
  const out = [];
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (out.length && (out[out.length - 1] + ' ' + s).length <= 180) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  return out.filter(Boolean);
}

// Speakers in order of appearance get distinct voices from the matching pool.
// If the device has too few voices, pitch tells them apart instead.
function castVoices(codes, kinds) {
  const all = speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  const pools = { f: all.filter(v => FEMALE.test(v.name)), m: all.filter(v => MALE.test(v.name) && !FEMALE.test(v.name)) };
  pools.n = all.filter(v => !pools.f.includes(v) && !pools.m.includes(v));
  if (!pools.n.length) pools.n = all;
  const used = { f: 0, m: 0, n: 0 };
  const basePitch = { f: 1.18, m: 0.82, n: 1 };
  const cast = new Map();
  for (const code of codes) {
    const k = kinds[code] || 'n';
    const pool = pools[k].length ? pools[k] : all;
    const i = used[k]++;
    const voice = pool.length ? pool[i % pool.length] : null;
    const reuse = !pool.length || i >= pool.length || !pools[k].length;
    cast.set(code, { voice, pitch: basePitch[k] + (reuse ? ((i % 3) - 1) * 0.1 : 0) });
  }
  return cast;
}

export function createTape(root, { voices = {}, label = 'Interview tape', short = '' } = {}) {
  const lines = [...root.querySelectorAll('.q, .a, .stage')].filter(el => el.classList.contains('stage') || el.querySelector('.spk'));
  const codeOf = el => (el.querySelector('.spk') || {}).textContent?.trim() || '';
  const textOf = el => [...el.children].filter(c => !c.classList.contains('spk')).map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const codes = [...new Set(lines.map(codeOf).filter(Boolean))];
  let cast = null, cur = 0, playing = false, seq = 0, rate = 1, timer = null;

  const status = h('span', { class: 'tape-status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'iconbtn sm tape-play', 'aria-label': 'Play', title: 'Play', onclick: () => (playing ? pause() : play()) }, icon('play'));
  const rateSel = h('select', { class: 'tape-rate', 'aria-label': 'Speed', onchange: e => { rate = +e.target.value; if (playing) say(cur); } },
    RATES.map(r => h('option', { value: r, selected: r === 1 }, `${r}x`)));
  const deck = h('div', { class: 'tdeck', role: 'group', 'aria-label': label },
    h('span', { class: 'cassette', 'aria-hidden': 'true' }, h('i', { class: 'reel' }), h('i', { class: 'reel' }), h('b', {}, short || label)),
    h('div', { class: 'tape-ctl' },
      h('button', { class: 'iconbtn sm', 'aria-label': 'Previous line', title: 'Previous line', onclick: () => jump(-1) }, icon('prev')),
      playBtn,
      h('button', { class: 'iconbtn sm', 'aria-label': 'Next line', title: 'Next line', onclick: () => jump(1) }, icon('next')),
      h('button', { class: 'iconbtn sm', 'aria-label': 'Stop and rewind', title: 'Stop and rewind', onclick: stop }, icon('stop')),
      rateSel),
    status);

  const mark = () => {
    lines.forEach((el, i) => el.classList.toggle('speaking', i === cur && (playing || cur > 0)));
    const el = lines[cur];
    status.textContent = `Line ${Math.min(cur + 1, lines.length)} of ${lines.length}${el && codeOf(el) ? ` · ${codeOf(el)}` : ''}`;
    deck.classList.toggle('rolling', playing);
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.title = playing ? 'Pause' : 'Play';
  };
  const silence = () => { seq++; clearTimeout(timer); speechSynthesis.cancel(); };

  function say(i) {
    silence();
    if (i >= lines.length) { playing = false; cur = 0; mark(); lines.forEach(el => el.classList.remove('speaking')); status.textContent = 'End of tape'; return; }
    cur = i; mark();
    const el = lines[i];
    el.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
    const tok = seq;
    const next = () => { if (tok === seq && playing) say(cur + 1); };
    if (el.classList.contains('stage')) { timer = setTimeout(next, /long/i.test(el.textContent) ? 1800 : 1000); return; }
    const part = cast.get(codeOf(el));
    const parts = chunks(textOf(el));
    const speakPart = j => {
      if (tok !== seq) return;
      if (j >= parts.length) { next(); return; }
      const u = new SpeechSynthesisUtterance(parts[j]);
      if (part && part.voice) { u.voice = part.voice; u.lang = part.voice.lang; } else u.lang = 'en-GB';
      u.pitch = part ? part.pitch : 1;
      u.rate = rate;
      u.onend = () => speakPart(j + 1);
      u.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') speakPart(j + 1); };
      speechSynthesis.speak(u);
    };
    speakPart(0);
  }
  function play() {
    if (!lines.length) return;
    if (!cast || !cast.size || [...cast.values()].every(c => !c.voice)) cast = castVoices(codes, voices);
    playing = true;
    say(cur);
  }
  function pause() { playing = false; silence(); mark(); }
  function stop() { playing = false; silence(); cur = 0; mark(); lines.forEach(el => el.classList.remove('speaking')); }
  function jump(d) { cur = Math.max(0, Math.min(lines.length - 1, cur + d)); if (playing) say(cur); else { mark(); lines[cur].scrollIntoView({ block: 'center' }); } }

  // Voices can arrive late; cast again once the list is known.
  const onVoices = () => { cast = castVoices(codes, voices); };
  speechSynthesis.addEventListener('voiceschanged', onVoices);
  mark();
  status.textContent = `${lines.length} lines · ${codes.length} voices`;
  return {
    el: deck,
    destroy() { stop(); speechSynthesis.removeEventListener('voiceschanged', onVoices); deck.remove(); },
  };
}
