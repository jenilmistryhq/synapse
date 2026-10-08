// Interview tapes: a transcript read aloud by the device's own text-to-speech
// with a local neural voice by default or the device's own speech API, while
// lighting up each line being read. Neural model downloads are cached locally.
//
// Cases can hint at a speaker's voice group in digital.json. Players can also
// choose any English voice installed in their browser for each speaker.

import { h, icon } from './util.js';
import { motionReduced } from './settings.js';

const hasDeviceSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
export const tapeSupported = () => typeof window !== 'undefined' && (hasDeviceSpeech() || ('AudioContext' in window && typeof Worker === 'function'));
export const hasTranscript = root => !!root.querySelector('.q .spk, .a .spk');

const FEMALE = /zira|susan|hazel|samantha|karen|moira|tessa|serena|victoria|fiona|libby|sonia|aria|jenny|emma|catherine|linda|kate|female/i;
const MALE = /david|mark|george|daniel|alex|fred|ryan|guy|thomas|james|oliver|arthur|richard|christopher|eric|brian|male/i;
const RATES = [0.85, 0.95, 1, 1.1, 1.2];
const CAST_KEY = 'synapse:tape-cast:';
const ENGINE_KEY = 'synapse:tape-engine:';
const NATURAL_VOICES = [
  ['bf_emma', 'Emma - British'], ['bf_isabella', 'Isabella - British'], ['bf_alice', 'Alice - British'], ['bf_lily', 'Lily - British'],
  ['bm_george', 'George - British'], ['bm_daniel', 'Daniel - British'], ['bm_fable', 'Fable - British'], ['bm_lewis', 'Lewis - British'],
  ['af_heart', 'Heart - American'], ['af_bella', 'Bella - American'], ['af_jessica', 'Jessica - American'], ['af_nicole', 'Nicole - American'],
  ['am_michael', 'Michael - American'], ['am_adam', 'Adam - American'], ['am_echo', 'Echo - American'], ['am_liam', 'Liam - American'],
];
const NATURAL_DEFAULTS = {
  f: NATURAL_VOICES.slice(0, 4).map(v => v[0]).concat(NATURAL_VOICES.slice(8, 12).map(v => v[0])),
  m: NATURAL_VOICES.slice(4, 8).map(v => v[0]).concat(NATURAL_VOICES.slice(12).map(v => v[0])),
};
NATURAL_DEFAULTS.n = [...NATURAL_DEFAULTS.f, ...NATURAL_DEFAULTS.m];

let naturalWorker = null, naturalRequestId = 0;
const naturalPending = new Map(), naturalProgress = new Set();
function requestNaturalSpeech(text, voice, speed) {
  if (!naturalWorker) {
    try { naturalWorker = new Worker(new URL('./tape-tts-worker.js', import.meta.url), { type: 'module' }); }
    catch (error) { return Promise.reject(error); }
    naturalWorker.addEventListener('message', event => {
      const data = event.data || {};
      if (data.type === 'progress') { naturalProgress.forEach(fn => fn(data.progress)); return; }
      const pending = naturalPending.get(data.id);
      if (!pending) return;
      naturalPending.delete(data.id);
      if (data.type === 'audio') pending.resolve({ pcm: new Float32Array(data.pcm), sampleRate: data.sampleRate });
      else pending.reject(new Error(data.message || 'Natural voice could not be loaded.'));
    });
    naturalWorker.addEventListener('error', event => {
      naturalPending.forEach(p => p.reject(new Error(event.message || 'Natural voice worker stopped.')));
      naturalPending.clear();
      naturalWorker = null;
    });
  }
  const id = ++naturalRequestId;
  return new Promise((resolve, reject) => {
    naturalPending.set(id, { resolve, reject });
    naturalWorker.postMessage({ type: 'synthesize', id, text, voice, speed });
  });
}

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
  return (hasDeviceSpeech() ? speechSynthesis.getVoices() : [])
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
function castVoices(codes, kinds, all, prefs, engine) {
  const pools = { f: all.filter(v => FEMALE.test(v.name)), m: all.filter(v => MALE.test(v.name) && !FEMALE.test(v.name)) };
  pools.n = all.filter(v => !pools.f.includes(v) && !pools.m.includes(v));
  if (!pools.n.length) pools.n = all;
  const usedDevice = new Set(), usedNatural = new Set();
  const cast = new Map();
  codes.forEach((code, i) => {
    const kind = kinds[code] || 'n';
    const saved = prefs[code] || '';
    const preferredNatural = saved.startsWith('kokoro:') ? saved.slice(7) : null;
    const preferredDevice = saved.startsWith('device:') ? saved.slice(7) : null;
    const preferred = all.find(v => v.voiceURI === preferredDevice);
    const matching = pools[kind] || [];
    const candidates = [...matching, ...all.filter(v => !matching.includes(v))];
    const naturalCandidates = NATURAL_DEFAULTS[kind] || NATURAL_DEFAULTS.n;
    const modelVoice = preferredNatural || (!preferredDevice && engine === 'natural'
      ? naturalCandidates.find(v => !usedNatural.has(v)) || NATURAL_DEFAULTS.n.find(v => !usedNatural.has(v)) || naturalCandidates[i % naturalCandidates.length]
      : null);
    const voice = preferred || (!modelVoice && (candidates.find(v => !usedDevice.has(v.voiceURI)) || candidates[i % Math.max(1, candidates.length)])) || null;
    if (voice) usedDevice.add(voice.voiceURI);
    if (modelVoice) usedNatural.add(modelVoice);
    const seed = [...code].reduce((n, c) => n + c.charCodeAt(0), 0);
    cast.set(code, { voice, modelVoice, pitch: 0.97 + (seed % 7) * 0.01, rate: 0.97 + (seed % 5) * 0.015 });
  });
  return cast;
}

export function createTape(root, { voices = {}, caseId = 'case', label = 'Interview tape', short = '' } = {}) {
  const lines = [...root.querySelectorAll('.q, .a, .stage')].filter(el => el.classList.contains('stage') || el.querySelector('.spk'));
  const codeOf = el => (el.querySelector('.spk') || {}).textContent?.trim() || '';
  const textOf = el => [...el.children].filter(c => !c.classList.contains('spk')).map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const codes = [...new Set(lines.map(codeOf).filter(Boolean))];
  const prefs = loadCast(caseId);
  let engine = 'natural';
  try { engine = localStorage.getItem(ENGINE_KEY + caseId) === 'device' ? 'device' : 'natural'; } catch {}
  let options = availableVoices(), cast = castVoices(codes, voices, options, prefs, engine);
  let cur = 0, playing = false, seq = 0, rate = 1, timer = null, previousCode = '';
  let audioContext = null, activeSource = null;

  const status = h('span', { class: 'tape-status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'iconbtn sm tape-play', 'aria-label': 'Play', title: 'Play', onclick: () => (playing ? pause() : play()) }, icon('play'));
  const rateSel = h('select', { class: 'tape-rate', 'aria-label': 'Speed', onchange: e => { rate = +e.target.value; if (playing) say(cur); } },
    RATES.map(r => h('option', { value: r, selected: r === 1 }, `${r}x`)));
  const engineSel = h('select', { class: 'tape-engine', 'aria-label': 'Voice engine', onchange: e => {
    engine = e.target.value;
    try { localStorage.setItem(ENGINE_KEY + caseId, engine); } catch {}
    cast = castVoices(codes, voices, options, prefs, engine);
    if (playing) say(cur);
  } },
    h('option', { value: 'natural' }, 'Natural AI voice (~92 MB once)'),
    h('option', { value: 'device', disabled: !hasDeviceSpeech() }, 'Device voice (instant)'));
  engineSel.value = engine;
  const castRows = new Map();
  const castPanel = h('details', { class: 'tape-cast' },
    h('summary', {}, `Cast voices - ${codes.length} speakers`),
    h('p', { class: 'tape-cast-help' }, 'Natural voices run on this device after a one-time download. Transcript text is not sent to a speech service. Choose a voice for each person, or leave Auto on.'),
    ...codes.map(code => {
      const select = h('select', { 'aria-label': `Voice for ${code}`, onchange: e => {
        if (e.target.value) prefs[code] = e.target.value; else delete prefs[code];
        saveCast(caseId, prefs);
        cast = castVoices(codes, voices, options, prefs, engine);
        if (playing) say(cur);
      } });
      castRows.set(code, select);
      return h('label', { class: 'tape-cast-row' }, h('span', {}, code), select);
    }));
  const updateVoiceOptions = () => {
    options = availableVoices();
    for (const [code, select] of castRows) {
      const saved = prefs[code];
      const legacyDevice = saved && !saved.includes(':') && options.some(v => v.voiceURI === saved) ? `device:${saved}` : saved;
      if (legacyDevice !== saved) prefs[code] = legacyDevice;
      select.replaceChildren(
        h('option', { value: '' }, 'Auto'),
        h('optgroup', { label: 'Natural AI voices' }, ...NATURAL_VOICES.map(([id, name]) => h('option', { value: `kokoro:${id}` }, name))),
        h('optgroup', { label: 'Voices on this device' }, ...options.map(v =>
        h('option', { value: `device:${v.voiceURI}` }, `${v.name} - ${v.lang}${v.localService ? '' : ' (online)'}`))));
      const valid = saved && (saved.startsWith('kokoro:') ? NATURAL_VOICES.some(v => `kokoro:${v[0]}` === saved) : saved.startsWith('device:') && options.some(v => `device:${v.voiceURI}` === saved));
      if (valid) select.value = legacyDevice;
      else { delete prefs[code]; select.value = ''; }
    }
    cast = castVoices(codes, voices, options, prefs, engine);
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
      rateSel,
      engineSel),
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
  const silence = () => {
    seq++; clearTimeout(timer);
    if (hasDeviceSpeech()) speechSynthesis.cancel();
    if (activeSource) { try { activeSource.stop(); } catch {} activeSource = null; }
  };

  const reportNaturalProgress = progress => {
    if (!playing) return;
    const percent = Number(progress && progress.progress);
    status.textContent = Number.isFinite(percent) && percent > 0
      ? `Preparing natural voice... ${Math.min(100, Math.round(percent))}%`
      : 'Preparing natural voice... downloading model on first use';
  };
  naturalProgress.add(reportNaturalProgress);

  async function playPcm(pcm, sampleRate, tok) {
    if (tok !== seq || !playing) return;
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (tok !== seq || !playing) return;
    const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(pcm, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    activeSource = source;
    await new Promise(resolve => {
      source.onended = () => { source.disconnect(); if (activeSource === source) activeSource = null; resolve(); };
      source.start();
    });
  }

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
      if (part && part.modelVoice) {
        status.textContent = 'Preparing natural voice...';
        requestNaturalSpeech(parts[j], part.modelVoice, Math.max(0.88, Math.min(1.12, rate * part.rate)))
          .then(({ pcm, sampleRate }) => playPcm(pcm, sampleRate, tok))
          .then(() => { if (tok === seq) timer = setTimeout(() => speakPart(j + 1), 140); })
          .catch(error => {
            if (tok !== seq) return;
            if (hasDeviceSpeech()) {
              status.textContent = `Natural voice could not load (${error.message}). Switched to device voice.`;
              engine = 'device'; engineSel.value = 'device';
              try { localStorage.setItem(ENGINE_KEY + caseId, engine); } catch {}
              for (const speaker of codes) if (prefs[speaker]?.startsWith('kokoro:')) delete prefs[speaker];
              saveCast(caseId, prefs);
              cast = castVoices(codes, voices, options, prefs, engine);
              say(cur);
            } else status.textContent = `Natural voice could not load. Check your connection and try again. (${error.message})`;
          });
        return;
      }
      if (!hasDeviceSpeech()) { status.textContent = 'Device speech is not available in this browser.'; return; }
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
    if (!cast || !cast.size) { options = availableVoices(); cast = castVoices(codes, voices, options, prefs, engine); }
    if (engine === 'natural') { audioContext ||= new AudioContext(); audioContext.resume().catch(() => {}); }
    playing = true;
    say(cur);
  }
  function pause() { playing = false; silence(); mark(); }
  function stop() { playing = false; silence(); cur = 0; previousCode = ''; mark(); lines.forEach(el => el.classList.remove('speaking')); }
  function jump(d) { cur = Math.max(0, Math.min(lines.length - 1, cur + d)); if (playing) say(cur); else { mark(); lines[cur].scrollIntoView({ block: 'center' }); } }

  // Voices can arrive late; cast again once the list is known.
  const onVoices = () => updateVoiceOptions();
  if (hasDeviceSpeech()) speechSynthesis.addEventListener('voiceschanged', onVoices);
  mark();
  status.textContent = `${lines.length} lines | ${codes.length} speakers | ${engine === 'natural' ? 'natural AI voice' : `${options.length} device voices`}`;
  return {
    el: deck,
    destroy() { stop(); naturalProgress.delete(reportNaturalProgress); if (hasDeviceSpeech()) speechSynthesis.removeEventListener('voiceschanged', onVoices); deck.remove(); },
  };
}
