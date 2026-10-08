// Interview tapes: a transcript read aloud by the device's own text-to-speech
// (the Web Speech API), one voice per speaker, lighting up the line being read.
// Nothing is downloaded and nothing leaves the browser.
//
// Cases can hint at a speaker's voice group in digital.json. Players can also
// choose any English voice installed in their browser for each speaker.

import { h, icon } from './util.js';
import { motionReduced } from './settings.js';

export const tapeSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
export const hasTranscript = root => !!root.querySelector('.q .spk, .a .spk');

const FEMALE = /zira|susan|hazel|samantha|karen|moira|tessa|serena|victoria|fiona|libby|sonia|aria|jenny|emma|catherine|linda|kate|female/i;
const MALE = /david|mark|george|daniel|alex|fred|ryan|guy|thomas|james|oliver|arthur|richard|christopher|eric|brian|male/i;
const RATES = [0.85, 0.95, 1, 1.1, 1.2];
const CAST_KEY = 'synapse:tape-cast:';

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

function availableVoices() {
  const langRank = lang => /^en-GB/i.test(lang) ? 0 : /^en-(IE|AU|NZ)/i.test(lang) ? 1 : /^en-US/i.test(lang) ? 2 : /^en/i.test(lang) ? 3 : 4;
  return speechSynthesis.getVoices()
    .filter(v => /^en(-|_|$)/i.test(v.lang))
    .sort((a, b) => langRank(a.lang) - langRank(b.lang)
      || Number(/natural|neural|enhanced|premium/i.test(b.name)) - Number(/natural|neural|enhanced|premium/i.test(a.name))
      || a.name.localeCompare(b.name));
}

function loadCast(caseId) {
  try { return JSON.parse(localStorage.getItem(CAST_KEY + caseId) || '{}'); } catch { return {}; }
}

function saveCast(caseId, prefs) {
  try { localStorage.setItem(CAST_KEY + caseId, JSON.stringify(prefs)); } catch {}
}

// Give each speaker a distinct installed voice when possible. Gender hints are
// soft: variety sounds more natural than the large pitch shifts used before.
function castVoices(codes, kinds, all, prefs) {
  const pools = { f: all.filter(v => FEMALE.test(v.name)), m: all.filter(v => MALE.test(v.name) && !FEMALE.test(v.name)) };
  pools.n = all.filter(v => !pools.f.includes(v) && !pools.m.includes(v));
  if (!pools.n.length) pools.n = all;
  const used = new Set();
  const cast = new Map();
  codes.forEach((code, i) => {
    const kind = kinds[code] || 'n';
    const preferred = all.find(v => v.voiceURI === prefs[code]);
    const matching = pools[kind] || [];
    const candidates = [...matching, ...all.filter(v => !matching.includes(v))];
    const voice = preferred || candidates.find(v => !used.has(v.voiceURI)) || candidates[i % Math.max(1, candidates.length)] || null;
    if (voice) used.add(voice.voiceURI);
    const seed = [...code].reduce((n, c) => n + c.charCodeAt(0), 0);
    cast.set(code, { voice, pitch: 0.97 + (seed % 7) * 0.01, rate: 0.97 + (seed % 5) * 0.015 });
  });
  return cast;
}

export function createTape(root, { voices = {}, caseId = 'case', label = 'Interview tape', short = '' } = {}) {
  const lines = [...root.querySelectorAll('.q, .a, .stage')].filter(el => el.classList.contains('stage') || el.querySelector('.spk'));
  const codeOf = el => (el.querySelector('.spk') || {}).textContent?.trim() || '';
  const textOf = el => [...el.children].filter(c => !c.classList.contains('spk')).map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const codes = [...new Set(lines.map(codeOf).filter(Boolean))];
  const prefs = loadCast(caseId);
  let options = availableVoices(), cast = castVoices(codes, voices, options, prefs);
  let cur = 0, playing = false, seq = 0, rate = 1, timer = null, previousCode = '';

  const status = h('span', { class: 'tape-status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'iconbtn sm tape-play', 'aria-label': 'Play', title: 'Play', onclick: () => (playing ? pause() : play()) }, icon('play'));
  const rateSel = h('select', { class: 'tape-rate', 'aria-label': 'Speed', onchange: e => { rate = +e.target.value; if (playing) say(cur); } },
    RATES.map(r => h('option', { value: r, selected: r === 1 }, `${r}x`)));
  const castRows = new Map();
  const castPanel = h('details', { class: 'tape-cast' },
    h('summary', {}, `Cast voices · ${codes.length} speakers`),
    h('p', { class: 'tape-cast-help' }, 'Auto gives each person a different voice when your device has them. Choices come from your browser or operating system.'),
    ...codes.map(code => {
      const select = h('select', { 'aria-label': `Voice for ${code}`, onchange: e => {
        if (e.target.value) prefs[code] = e.target.value; else delete prefs[code];
        saveCast(caseId, prefs);
        cast = castVoices(codes, voices, options, prefs);
        if (playing) say(cur);
      } });
      castRows.set(code, select);
      return h('label', { class: 'tape-cast-row' }, h('span', {}, code), select);
    }));
  const updateVoiceOptions = () => {
    options = availableVoices();
    for (const [code, select] of castRows) {
      const saved = prefs[code];
      select.replaceChildren(h('option', { value: '' }, 'Auto'), ...options.map(v =>
        h('option', { value: v.voiceURI }, `${v.name} · ${v.lang}${v.localService ? '' : ' (online)'}`)));
      if (saved && options.some(v => v.voiceURI === saved)) select.value = saved;
      else { delete prefs[code]; select.value = ''; }
    }
    cast = castVoices(codes, voices, options, prefs);
    saveCast(caseId, prefs);
  };
  updateVoiceOptions();
  const deck = h('div', { class: 'tdeck', role: 'group', 'aria-label': label },
    h('span', { class: 'cassette', 'aria-hidden': 'true' }, h('i', { class: 'reel' }), h('i', { class: 'reel' }), h('b', {}, short || label)),
    h('div', { class: 'tape-ctl' },
      h('button', { class: 'iconbtn sm', 'aria-label': 'Previous line', title: 'Previous line', onclick: () => jump(-1) }, icon('prev')),
      playBtn,
      h('button', { class: 'iconbtn sm', 'aria-label': 'Next line', title: 'Next line', onclick: () => jump(1) }, icon('next')),
      h('button', { class: 'iconbtn sm', 'aria-label': 'Stop and rewind', title: 'Stop and rewind', onclick: stop }, icon('stop')),
      rateSel),
    castPanel,
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
    if (i >= lines.length) { playing = false; cur = 0; previousCode = ''; mark(); lines.forEach(el => el.classList.remove('speaking')); status.textContent = 'End of tape'; return; }
    cur = i; mark();
    const el = lines[i];
    el.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
    const tok = seq;
    const code = codeOf(el);
    const next = () => {
      if (tok !== seq || !playing) return;
      const pauseForReply = code && previousCode && code !== previousCode ? 380 : 180;
      previousCode = code || previousCode;
      timer = setTimeout(() => say(cur + 1), pauseForReply);
    };
    if (el.classList.contains('stage')) { timer = setTimeout(next, /long/i.test(el.textContent) ? 1800 : 1000); return; }
    const part = cast.get(codeOf(el));
    const parts = chunks(textOf(el));
    const speakPart = j => {
      if (tok !== seq) return;
      if (j >= parts.length) { next(); return; }
      const u = new SpeechSynthesisUtterance(parts[j]);
      if (part && part.voice) { u.voice = part.voice; u.lang = part.voice.lang; } else u.lang = 'en-GB';
      u.pitch = part ? part.pitch : 1;
      u.rate = rate * (part ? part.rate : 1);
      u.onend = () => { timer = setTimeout(() => speakPart(j + 1), 110); };
      u.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') speakPart(j + 1); };
      speechSynthesis.speak(u);
    };
    speakPart(0);
  }
  function play() {
    if (!lines.length) return;
    if (!cast || !cast.size || [...cast.values()].every(c => !c.voice)) { options = availableVoices(); cast = castVoices(codes, voices, options, prefs); }
    playing = true;
    say(cur);
  }
  function pause() { playing = false; silence(); mark(); }
  function stop() { playing = false; silence(); cur = 0; previousCode = ''; mark(); lines.forEach(el => el.classList.remove('speaking')); }
  function jump(d) { cur = Math.max(0, Math.min(lines.length - 1, cur + d)); if (playing) say(cur); else { mark(); lines[cur].scrollIntoView({ block: 'center' }); } }

  // Voices can arrive late; cast again once the list is known.
  const onVoices = () => updateVoiceOptions();
  speechSynthesis.addEventListener('voiceschanged', onVoices);
  mark();
  status.textContent = `${lines.length} lines · ${codes.length} speakers · ${options.length ? `${options.length} voices available` : 'waiting for device voices'}`;
  return {
    el: deck,
    destroy() { stop(); speechSynthesis.removeEventListener('voiceschanged', onVoices); deck.remove(); },
  };
}
