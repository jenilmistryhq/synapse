// The evidence board: a green felt board to pin people, exhibits, documents,
// notes and voice notes to, and to tie together with red string.
//
// Saved in the case state as st.board = { cards: [...], links: [...] }:
//   card  { key, kind: person|exhibit|doc|note|voice, ref, x, y, text, dur }
//   link  { a, b, label }   (a and b are card keys)
// Mouse: drag a card; "Connect" then click two cards to tie them.
// Keyboard: arrows move the focused card (Shift for bigger steps), L ties it to
// the next card you press L on, Delete takes it off the board.

import { h, icon, modal, toast, confirmModal, plural } from './util.js';
import { portrait, fullName, surname } from './people.js';
import { visibleExhibits, exhibitIcon } from './exhibits.js';
import { voiceSupported, putVoice, getVoice, deleteVoice } from './voice.js';
import { sfx } from './sfx.js';

const FELT_W = 1800, FELT_H = 1200;
const WIDTH = { person: 132, exhibit: 140, doc: 164, note: 176, voice: 164 };
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tiltOf = key => { let x = 0; for (const ch of key) x = (x * 31 + ch.charCodeAt(0)) % 997; return ((x % 9) - 4) * 0.5; };

export function boardSummary(st) {
  const b = st.board || { cards: [], links: [] };
  if (!b.cards.length) return 'Empty';
  return `${plural(b.cards.length, 'card')}${b.links.length ? ` · ${plural(b.links.length, 'string')}` : ''}`;
}

export function openBoard({ m, st, save, ids, reg, refOf, onOpenDoc, behind }) {
  st.board ||= { cards: [], links: [] };
  const B = st.board;
  const vkey = key => `${m.id}:${key}`;
  let connect = false, linking = null, drag = null, playing = null;

  /* --- what can be pinned ---------------------------------------------------- */
  const person = ref => m.persons.list.find(p => p.id === ref);
  const exhibit = ref => (m.exhibits || []).find(x => x.ref === ref);
  const pinnable = () => ({
    people: m.persons.list.map(p => ({ key: `person:${p.id}`, kind: 'person', ref: p.id, label: fullName(p) })),
    exhibits: visibleExhibits(m, ids).map(x => ({ key: `exhibit:${x.ref}`, kind: 'exhibit', ref: x.ref, label: `${x.ref} · ${x.name}` })),
    docs: ids.filter(id => reg.get(id).kind !== 'brief').map(id => ({ key: `doc:${id}`, kind: 'doc', ref: id, label: `${refOf(id)} · ${reg.get(id).title}` })),
  });
  const onBoard = key => B.cards.some(c => c.key === key);

  /* --- shell --------------------------------------------------------------------- */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'bd-strings');
  svg.setAttribute('width', FELT_W); svg.setAttribute('height', FELT_H);
  // Labels ride above the cards so a card never hides what a string says.
  const labels = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  labels.setAttribute('class', 'bd-labels');
  labels.setAttribute('width', FELT_W); labels.setAttribute('height', FELT_H);
  const felt = h('div', { class: 'bd-felt', style: { width: `${FELT_W}px`, height: `${FELT_H}px` } }, svg, labels);
  const scroll = h('div', { class: 'bd-scroll' }, felt);
  const tray = h('aside', { class: 'bd-tray', 'aria-label': 'Pin to the board' });
  const connectBtn = h('button', { class: 'btn sm ghost', 'aria-pressed': 'false', onclick: () => setConnect(!connect), title: 'Click two cards to tie them with string' }, icon('link'), h('span', { class: 'blbl' }, 'Connect'));
  const hint = h('span', { class: 'bd-hint', 'aria-live': 'polite' });
  const root = h('div', { class: 'bd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Evidence board' },
    h('header', { class: 'bd-top' },
      h('div', { class: 'bd-title' }, h('b', {}, 'Evidence board'), hint),
      h('div', { class: 'bd-actions' },
        connectBtn,
        h('button', { class: 'btn sm ghost', onclick: () => addNote(), title: 'Pin a blank index card' }, icon('notes'), h('span', { class: 'blbl' }, 'Note')),
        voiceSupported() ? h('button', { class: 'btn sm ghost', onclick: recordVoice, title: 'Record a voice note (kept on this device)' }, icon('mic'), h('span', { class: 'blbl' }, 'Voice note')) : null,
        h('button', { class: 'btn sm ghost', onclick: clearBoard, title: 'Take everything off the board' }, icon('trash'), h('span', { class: 'blbl' }, 'Clear')),
        h('button', { class: 'iconbtn', 'aria-label': 'Close the board', title: 'Close (Esc)', onclick: close }, icon('close')))),
    h('div', { class: 'bd-main' }, tray, scroll));
  document.body.append(root);
  if (behind) behind.inert = true;

  /* --- tray ---------------------------------------------------------------------- */
  function drawTray() {
    const p = pinnable();
    const sec = (title, list) => list.length ? h('div', { class: 'bd-sec' }, h('div', { class: 'bd-sec-h' }, title),
      list.map(x => h('button', { class: 'bd-pin', disabled: onBoard(x.key), onclick: () => pin(x), title: onBoard(x.key) ? 'Already on the board' : 'Pin to the board' },
        icon(onBoard(x.key) ? 'check' : 'plus'), h('span', {}, x.label)))) : null;
    tray.replaceChildren(sec('People', p.people), sec('Exhibits', p.exhibits), sec('Documents', p.docs));
  }

  /* --- cards ------------------------------------------------------------------------ */
  // A new card goes to the free spot nearest the middle of what you can see.
  const CARD_H = 200;
  const place = kind => {
    const w = WIDTH[kind] || 150;
    const cx = scroll.scrollLeft + scroll.clientWidth / 2 - w / 2, cy = scroll.scrollTop + scroll.clientHeight / 2 - CARD_H / 2;
    const free = (x, y) => B.cards.every(c => x + w + 16 <= c.x || c.x + (WIDTH[c.kind] || 150) + 16 <= x || y + CARD_H + 16 <= c.y || c.y + CARD_H + 16 <= y);
    for (let ring = 0; ring < 8; ring++) {
      for (let i = 0; i < Math.max(1, ring * 8); i++) {
        const a = (i / Math.max(1, ring * 8)) * Math.PI * 2;
        const x = clamp(cx + Math.cos(a) * ring * 120, 10, FELT_W - w - 10), y = clamp(cy + Math.sin(a) * ring * 110, 20, FELT_H - CARD_H - 10);
        if (free(x, y)) return { x, y };
      }
    }
    return { x: clamp(cx + ((B.cards.length * 37) % 160) - 80, 10, FELT_W - w - 10), y: clamp(cy, 20, FELT_H - CARD_H - 10) };
  };
  function pin(x) {
    if (onBoard(x.key)) return;
    B.cards.push({ key: x.key, kind: x.kind, ref: x.ref, ...place(x.kind) });
    sfx.tick(); save(); draw(); focusCard(x.key);
  }
  function addNote() {
    const key = `note:${uid()}`;
    B.cards.push({ key, kind: 'note', text: '', ...place('note') });
    sfx.paper(); save(); draw();
    const ta = felt.querySelector(`[data-key="${key}"] textarea`); if (ta) ta.focus();
  }
  function unpin(key) {
    const c = B.cards.find(x => x.key === key);
    if (!c) return;
    if (c.kind === 'voice') deleteVoice(vkey(key));
    B.cards = B.cards.filter(x => x.key !== key);
    B.links = B.links.filter(l => l.a !== key && l.b !== key);
    st.board = B; save(); sfx.close(); draw();
  }

  function cardBody(c) {
    if (c.kind === 'person') {
      const p = person(c.ref); if (!p) return null;
      const status = st.sheet.persons[p.id].status;
      return [portrait(m, p), h('b', { class: 'bc-name' }, surname(p)), h('span', { class: 'bc-sub' }, p.role),
        status !== 'Open' ? h('span', { class: `bc-stamp s-${status.toLowerCase()}` }, status) : null];
    }
    if (c.kind === 'exhibit') {
      const x = exhibit(c.ref); if (!x) return null;
      return [h('span', { class: `bc-bag${x.missing ? ' missing' : ''}` }, exhibitIcon(x.icon)), h('b', { class: 'bc-ref' }, x.ref), h('span', { class: 'bc-sub' }, x.name)];
    }
    if (c.kind === 'doc') {
      const d = reg.get(c.ref); if (!d) return null;
      return [h('b', { class: 'bc-ref' }, refOf(c.ref)), h('span', { class: 'bc-sub' }, d.title),
        ids.includes(c.ref) ? h('button', { class: 'bc-open', onclick: () => { close(); onOpenDoc(c.ref); } }, icon('file'), 'Read') : null];
    }
    if (c.kind === 'note') {
      return [h('textarea', { class: 'hand', rows: 4, value: c.text || '', 'aria-label': 'Note', placeholder: 'Write on the card...', oninput: e => { c.text = e.target.value; save(); } })];
    }
    if (c.kind === 'voice') {
      const btn = h('button', { class: 'bc-play', 'aria-label': 'Play voice note', onclick: () => playVoice(c, btn) }, icon('play'));
      return [h('div', { class: 'bc-voice' }, btn, h('span', { class: 'bc-wave', 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { style: { height: `${6 + ((i * 7 + c.key.length * 3) % 16)}px` } }))), h('span', { class: 'mono bc-dur' }, `${Math.round(c.dur || 0)}s`)),
        h('input', { class: 'bc-cap', value: c.text || '', placeholder: 'Caption', 'aria-label': 'Voice note caption', oninput: e => { c.text = e.target.value; save(); } })];
    }
    return null;
  }
  const labelOf = c => (c.kind === 'person' && person(c.ref) ? fullName(person(c.ref)) : c.kind === 'exhibit' ? `Exhibit ${c.ref}` : c.kind === 'doc' ? `Document ${refOf(c.ref)}` : c.kind === 'voice' ? 'Voice note' : 'Note');

  function cardEl(c) {
    const body = cardBody(c);
    if (!body) return null;
    const el = h('div', {
      class: `bcard k-${c.kind}${linking === c.key ? ' linking' : ''}`, tabindex: '0', role: 'group',
      'aria-label': `${labelOf(c)}. Arrow keys move it, L ties string, Delete removes it.`,
      style: { left: `${c.x}px`, top: `${c.y}px`, width: `${WIDTH[c.kind]}px`, '--tilt': `${tiltOf(c.key)}deg` },
      dataset: { key: c.key },
    },
    h('span', { class: 'bc-pin' }),
    h('button', { class: 'bc-x', 'aria-label': `Take ${labelOf(c)} off the board`, title: 'Take off the board', onclick: () => unpin(c.key) }, icon('close')),
    body);
    el.addEventListener('pointerdown', e => startDrag(e, c, el));
    el.addEventListener('click', e => { if (connect && !e.target.closest('button, textarea, input')) linkTap(c.key); });
    el.addEventListener('keydown', e => cardKey(e, c, el));
    return el;
  }

  function draw() {
    felt.replaceChildren(svg, ...B.cards.map(cardEl).filter(Boolean), labels);
    drawStrings();
    drawTray();
    hint.textContent = linking ? 'Now pick the card to tie it to (Esc cancels)' : connect ? 'Click a card, then another, to tie them' : B.cards.length ? boardSummary(st) : 'Pin people, exhibits and documents from the left';
  }
  const focusCard = key => { const el = felt.querySelector(`.bcard[data-key="${CSS.escape(key)}"]`); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };

  /* --- string ------------------------------------------------------------------------ */
  const pinAt = key => {
    const c = B.cards.find(x => x.key === key);
    return c ? { x: c.x + (WIDTH[c.kind] || 150) / 2, y: c.y + 4 } : null;
  };
  function drawStrings() {
    const NS = 'http://www.w3.org/2000/svg';
    const tags = [];
    svg.replaceChildren(...B.links.map((l, i) => {
      const a = pinAt(l.a), b = pinAt(l.b);
      if (!a || !b) return null;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
      const d = `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'bd-link');
      const hit = document.createElementNS(NS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'hit');
      const line = document.createElementNS(NS, 'path'); line.setAttribute('d', d); line.setAttribute('class', 'line');
      g.append(hit, line);
      if (l.label) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', mx); t.setAttribute('y', (a.y + b.y) / 2 + (my - (a.y + b.y) / 2) / 2 - 6);
        t.setAttribute('text-anchor', 'middle'); t.textContent = l.label;
        t.addEventListener('click', () => editLink(i));
        tags.push(t);
      }
      g.addEventListener('click', () => editLink(i));
      return g;
    }).filter(Boolean));
    labels.replaceChildren(...tags);
  }
  function linkTap(key) {
    if (!linking) { linking = key; sfx.tick(); draw(); focusCard(key); return; }
    if (linking === key) { linking = null; draw(); return; }
    const [a, b] = [linking, key];
    linking = null;
    if (!B.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) { B.links.push({ a, b, label: '' }); sfx.paper(); save(); toast('Tied with string. Click the string to label it.'); }
    draw(); focusCard(key);
  }
  function editLink(i) {
    const l = B.links[i];
    const input = h('input', { class: 'field', value: l.label || '', maxlength: 60, placeholder: 'e.g. lied about the time', 'aria-label': 'Label for the string' });
    modal({
      kicker: 'String', title: `${labelOf(B.cards.find(c => c.key === l.a) || {})} to ${labelOf(B.cards.find(c => c.key === l.b) || {})}`,
      body: [h('p', {}, 'What connects them? A few words are enough.'), input],
      actions: [
        { label: 'Cut the string', kind: 'danger', onClick: () => { B.links.splice(i, 1); save(); draw(); } },
        { label: 'Save', kind: 'primary', onClick: () => { l.label = input.value.trim(); save(); draw(); } },
      ],
    });
    setTimeout(() => input.focus(), 50);
  }
  function setConnect(on) {
    connect = on; linking = null;
    connectBtn.setAttribute('aria-pressed', String(on));
    connectBtn.classList.toggle('primary', on); connectBtn.classList.toggle('ghost', !on);
    root.classList.toggle('connecting', on);
    draw();
  }

  /* --- moving cards ------------------------------------------------------------------ */
  function startDrag(e, c, el) {
    if (connect || e.button !== 0 || e.target.closest('button, textarea, input')) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    drag = { c, el, dx: e.clientX - c.x, dy: e.clientY - c.y, moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const move = ev => {
      drag.moved = true;
      c.x = clamp(ev.clientX - drag.dx, 0, FELT_W - (WIDTH[c.kind] || 150));
      c.y = clamp(ev.clientY - drag.dy, 8, FELT_H - 60);
      el.style.left = `${c.x}px`; el.style.top = `${c.y}px`;
      drawStrings();
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      if (drag.moved) save();
      drag = null;
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function cardKey(e, c, el) {
    if (e.target !== el) return; // typing in a note or caption
    const step = e.shiftKey ? 40 : 10;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      c.x = clamp(c.x + mv[0], 0, FELT_W - (WIDTH[c.kind] || 150)); c.y = clamp(c.y + mv[1], 8, FELT_H - 60);
      el.style.left = `${c.x}px`; el.style.top = `${c.y}px`; drawStrings(); save();
    } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); unpin(c.key); }
    else if (e.key === 'l' || e.key === 'L' || (e.key === 'Enter' && connect)) { e.preventDefault(); linkTap(c.key); }
  }

  /* --- voice notes ------------------------------------------------------------------- */
  async function playVoice(c, btn) {
    if (playing) { const same = playing.key === c.key; playing.stop(); if (same) return; }
    let blob;
    try { blob = await getVoice(vkey(c.key)); } catch { blob = null; }
    if (!blob) { toast('That recording is not on this device any more.'); return; }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const stop = () => { audio.pause(); URL.revokeObjectURL(url); btn.replaceChildren(icon('play')); btn.setAttribute('aria-label', 'Play voice note'); if (playing && playing.key === c.key) playing = null; };
    playing = { key: c.key, stop };
    audio.addEventListener('ended', stop);
    btn.replaceChildren(icon('pause')); btn.setAttribute('aria-label', 'Stop voice note');
    audio.play().catch(stop);
  }

  async function recordVoice() {
    let stream = null, rec = null, chunks = [], blob = null, dur = 0, started = 0, timer = null;
    const MAX = 60;
    const clock = h('span', { class: 'mono rec-clock' }, '0:00');
    const status = h('p', { class: 'rec-status' }, `Press record and speak. Up to ${MAX} seconds. The recording stays on this device.`);
    const preview = h('audio', { controls: true, hidden: true });
    const recBtn = h('button', { class: 'btn rec-btn', onclick: () => (rec && rec.state === 'recording' ? stopRec() : startRec()) }, icon('mic'), 'Record');
    const cleanup = () => { clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (preview.src) URL.revokeObjectURL(preview.src); };
    const dlg = modal({
      kicker: 'Evidence board', title: 'Voice note', className: 'rec-modal',
      body: [status, h('div', { class: 'rec-row' }, recBtn, clock), preview],
      actions: [
        { label: 'Cancel' },
        { label: 'Pin to the board', kind: 'primary', disabled: true, onClick: async () => {
          const key = `voice:${uid()}`;
          try { await putVoice(vkey(key), blob); } catch { toast('This browser would not store the recording.'); return false; }
          B.cards.push({ key, kind: 'voice', text: '', dur, ...place('voice') });
          save(); draw(); sfx.tick();
        } },
      ],
      onClose: cleanup,
    });
    const pinBtn = dlg.buttons[1];
    async function startRec() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
        status.textContent = 'The microphone is blocked. Allow it for this site in the browser, then try again.'; return;
      }
      chunks = []; blob = null; pinBtn.disabled = true; preview.hidden = true;
      rec = new MediaRecorder(stream);
      rec.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
      rec.addEventListener('stop', () => {
        dur = (Date.now() - started) / 1000;
        blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (stream) stream.getTracks().forEach(t => t.stop()); stream = null;
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(blob); preview.hidden = false;
        status.textContent = 'Listen back, then pin it to the board, or record again.';
        recBtn.replaceChildren(icon('mic'), 'Record again'); recBtn.classList.remove('on');
        pinBtn.disabled = false;
      });
      rec.start();
      started = Date.now();
      status.textContent = 'Recording...';
      recBtn.replaceChildren(icon('stop'), 'Stop'); recBtn.classList.add('on');
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= MAX) stopRec();
      }, 250);
    }
    function stopRec() { clearInterval(timer); if (rec && rec.state === 'recording') rec.stop(); }
  }

  async function clearBoard() {
    if (!B.cards.length) return;
    const ok = await confirmModal({ title: 'Clear the board?', body: 'Every card, note, voice note and string comes off. Your case notes and Resolution Sheet are not touched.', confirm: 'Clear the board', danger: true });
    if (!ok) return;
    B.cards.filter(c => c.kind === 'voice').forEach(c => deleteVoice(vkey(c.key)));
    B.cards = []; B.links = []; save(); draw();
  }

  /* --- open and close ---------------------------------------------------------------- */
  const onKey = e => {
    if (e.key !== 'Escape' || document.querySelector('.modal-wrap')) return;
    e.stopPropagation(); e.preventDefault();
    // Esc while writing on a card steps out to the card; the next Esc closes.
    const typing = document.activeElement && document.activeElement.closest('.bcard textarea, .bcard input');
    if (typing) { document.activeElement.closest('.bcard').focus({ preventScroll: true }); return; }
    if (linking || connect) { setConnect(false); return; }
    close();
  };
  document.addEventListener('keydown', onKey, true);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    if (playing) playing.stop();
    document.removeEventListener('keydown', onKey, true);
    if (behind) behind.inert = false;
    root.remove();
    save();
    onClose && onClose();
  }
  let onClose = null;
  draw();
  requestAnimationFrame(() => {
    // start in the middle of the cards, or the top-left of an empty board
    if (B.cards.length) {
      const xs = B.cards.map(c => c.x), ys = B.cards.map(c => c.y);
      scroll.scrollLeft = (Math.min(...xs) + Math.max(...xs)) / 2 - scroll.clientWidth / 2 + 70;
      scroll.scrollTop = (Math.min(...ys) + Math.max(...ys)) / 2 - scroll.clientHeight / 2 + 60;
    }
    const first = tray.querySelector('.bd-pin:not(:disabled)') || root.querySelector('.bd-actions .btn');
    if (first) first.focus({ preventScroll: true });
  });
  return { close, set onClose(fn) { onClose = fn; } };
}
