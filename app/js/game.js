// The investigation desk. Folders, sealed envelopes, a clipboard, a notebook,
// a calculator and a bell, on a wooden desk. Documents open in a reader;
// the clipboard and notebook dock beside it so you can write while you read.

import { h, $$, icon, fmtClock, debounce, toast, modal, confirmModal, calc, plural } from './util.js';
import { renderPages, rangeToOffsets, wrapRange, pageNode, loadSlips, loadSealed } from './docs.js';
import {
  saveState, clearState, timerNow, timerStart, timerStop, timerRebase, timerRunning,
  authoritiesOpen, remaining, fileStillSplit, isPhased, hintCosts, hintsTaken,
} from './state.js';
import { openEnvelope } from './fx.js';
import { sfx, soundOn, setSound } from './sfx.js';
import { runTour } from './tour.js';
import { openSettings, getSettings, setSetting } from './settings.js';
import { portrait, fullName, surname, mentions } from './people.js';
import { visibleExhibits, evidenceBag } from './exhibits.js';
import { tapeSupported, hasTranscript, createTape } from './tape.js';
import { openBoard, boardSummary } from './board.js';
import { mountGuide } from './guide.js';
import { makeRoomCode, makePeerId, validRoomCode, openPeerRoom } from './peer.js';

const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
const tilt = id => { let x = 0; for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) % 997; return ((x % 7) - 3) * 0.45; };

export function mountGame(root, m, st, { go }) {
  const reg = m._reg;
  const phased = isPhased(m, st);
  const listeners = [];
  const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); listeners.push(() => target.removeEventListener(ev, fn, opts)); };
  const ui = { reader: null, compare: null, active: 0, drawer: null };

  if (st.timer.since) st.timer.since = Date.now();
  if (st.timer.auto) timerStart(st);
  document.body.classList.add('desk-lock');

  let peerRoom = null, peerCode = '', groupStatusText = '', groupTransition = false;
  const save = debounce(() => { saveState(st); if (peerRoom) peerRoom.publish(); }, 300);
  const saveNow = () => save.flush();

  /* --- shell ---------------------------------------------------------------- */
  const top = h('header', { class: 'dk-top' });
  const surface = h('main', { class: 'dk-surface', 'aria-label': 'Desk' });
  const reader = h('section', { class: 'rd', hidden: true, 'aria-label': 'Document reader' });
  const drawer = h('aside', { class: 'dw', hidden: true, 'aria-label': 'Clipboard and notebook' });
  const citeList = h('datalist', { id: 'cite-list' });
  const game = h('div', { class: 'dk' }, top, surface, reader, drawer, citeList);
  root.replaceChildren(game);

  /* --- documents available ---------------------------------------------------- */
  const fileDocIds = f => m.documents.filter(d => d.file === f).map(d => d.id);
  const fileName = f => ((m.files || []).find(x => x.id === f) || {}).name || f;
  const expand = d => (d.startsWith('file:') ? fileDocIds(d.slice(5)) : [d]);

  function available() {
    const ids = [];
    const add = id => { if (reg.has(id) && !ids.includes(id)) ids.push(id); };
    if (phased) m.phases.slice(0, st.phase).forEach(p => p.docs.forEach(d => expand(d).forEach(add)));
    else m.documents.forEach(d => add(d.id));
    st.spent.forEach(s => add(`SLIP ${s.n}`));
    st.accusations.forEach(a => a.reconsider && add(a.reconsider));
    return ids;
  }
  const refOf = id => { const d = reg.get(id); return d.kind === 'slip' ? `Authority ${d.n}` : d.kind === 'reconsider' ? 'Reconsider' : d.id; };

  /* --- top bar ---------------------------------------------------------------- */
  let clockText;
  function renderTop() {
    const left = remaining(st);
    const tries = 3 - st.accusations.length;
    clockText = h('span', { class: 't' }, fmtClock(timerNow(st)));
    top.replaceChildren(
      h('a', { class: 'dk-back', href: '#/', title: 'Back to all cases (progress is saved)' }, icon('left'), h('span', { class: 'brand-mark' })),
      h('div', { class: 'dk-case' }, h('span', { class: 'case-no' }, `Case ${m.number} · ${m.tier}`), h('span', { class: 'case-title' }, m.title)),
      h('div', { class: 'dk-stats' },
        h('button', { class: `watch ${timerRunning(st) ? '' : 'paused'}`, onclick: toggleTimer, title: timerRunning(st) ? 'Pause the clock' : 'Resume the clock' },
          h('span', { class: 'watch-face' }, icon(timerRunning(st) ? 'clock' : 'pause')), clockText),
        h('span', { class: 'tokens', title: `${left} of ${st.budget} Authorities left` },
          Array.from({ length: st.budget }, (_, i) => h('i', { class: i < left ? 'on' : '' })), h('b', {}, left)),
        h('span', { class: `tries ${tries === 1 ? 'final' : ''}`, title: 'Accusations left. The third is final.' }, icon('accuse'), h('b', {}, tries === 1 ? 'Final' : tries))),
      h('div', { class: 'dk-actions' },
        h('button', { class: `btn sm ${peerRoom ? 'primary' : 'ghost'} group-room-btn`, onclick: openGroupRoom, title: 'Share this investigation with your group' }, icon('users'), h('span', {}, peerRoom ? 'Group' : 'Group play')),
        h('button', { class: 'iconbtn', title: soundOn() ? 'Mute sounds' : 'Turn sounds on', 'aria-label': 'Toggle sound', onclick: () => { setSound(!soundOn()); renderTop(); if (soundOn()) sfx.tick(); } }, icon(soundOn() ? 'sound' : 'mute')),
        h('button', { class: 'iconbtn', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings({ onChange: () => { renderTop(); if (ui.reader) $$('.rd-paper', reader).forEach(p => { p.style.zoom = getSettings().docZoom; }); } }) }, icon('gear')),
        h('button', { class: 'iconbtn', title: 'Rules and help', 'aria-label': 'Rules and help', onclick: showHelp }, icon('help')),
        h('button', { class: 'stamp-btn', onclick: accuse, title: 'Make an accusation' }, h('span', {}, 'Accuse'))));
  }

  function toggleTimer() {
    if (timerRunning(st)) { timerStop(st); toast('Clock paused'); } else { timerStart(st); toast('Clock running'); }
    sfx.tick(); saveNow(); renderTop();
  }

  function openGroupRoom() {
    const status = h('p', { class: 'group-status', role: 'status', 'aria-live': 'polite' }, peerRoom ? (groupStatusText || 'Room connected.') : 'Open a room or join one with an invite code.');
    const invite = h('input', { class: 'field group-code', readonly: true, value: peerRoom && peerRoom.role === 'host' ? peerCode : '', 'aria-label': 'Room invite code', placeholder: 'Your room code will appear here', hidden: !(peerRoom && peerRoom.role === 'host') });
    const joinCode = h('input', { class: 'field group-code', maxlength: 45, placeholder: 'Paste the 45-character invite code', 'aria-label': 'Invite code' });
    const copy = h('button', { class: 'btn ghost sm', hidden: !invite.value, onclick: async () => { try { await navigator.clipboard.writeText(invite.value); toast('Invite code copied.'); } catch { invite.select(); toast('Select and copy the invite code.'); } } }, 'Copy code');
    const actions = [];
    let dialog;
    if (!peerRoom) {
      actions.push({ label: 'Open a group room', kind: 'primary', onClick: async () => {
        const code = makeRoomCode();
        status.textContent = 'Opening the room…';
        try {
          peerRoom = await openPeerRoom({ roomCode: code, peerId: makePeerId(), host: true, state: st, statuses: m.persons.statuses, optionIds: m.accusation.options.map(x => x.id), onStatus: setGroupStatus, onState: receiveGroupState });
          peerCode = code; invite.value = code; invite.hidden = false; copy.hidden = false; renderTop(); dialog.close(); openGroupRoom();
        } catch (e) { status.textContent = e.message || 'Could not open the room.'; }
        return false;
      } });
      actions.push({ label: 'Join with code', kind: 'ghost', onClick: async () => {
        const code = joinCode.value.trim();
        if (!validRoomCode(code)) { status.textContent = 'Enter the 45-character room code from the host.'; return false; }
        status.textContent = 'Joining the room…';
        try {
          peerRoom = await openPeerRoom({ roomCode: code, peerId: makePeerId(), host: false, state: st, statuses: m.persons.statuses, optionIds: m.accusation.options.map(x => x.id), onStatus: setGroupStatus, onState: receiveGroupState });
          peerCode = code; renderTop(); joinCode.hidden = true; dialog.close(); openGroupRoom();
        } catch (e) { status.textContent = e.message || 'Could not join the room.'; }
        return false;
      } });
    } else {
      if (!groupStatusText) groupStatusText = `Connected to a ${peerRoom.role === 'host' ? 'hosted' : 'host'} room. The host needs to stay online. Shared work includes case phases, Authorities, the evidence board, notes, highlights, and Resolution Sheet.`;
      status.textContent = groupStatusText;
      actions.push({ label: 'Leave room', kind: 'danger', onClick: () => { peerRoom.close(); peerRoom = null; peerCode = ''; groupStatusText = ''; renderTop(); toast('Left the group room.'); } });
    }
    dialog = modal({ kicker: `Case ${m.number} · Group play`, title: 'Work this file together', className: 'group-room-modal',
      body: [h('p', { class: 'hint' }, 'Everyone opens the same case and starts an investigation first. The invite code is a bearer key: share it only with your group. Shared investigation work and accusations are encrypted before they leave the device. Supabase relays signed connection setup only; each player follows the reveal on their own screen.'), status, invite, copy, peerRoom ? null : joinCode,
        h('p', { class: 'group-footnote' }, 'Early access: keep the host tab open. Each player also keeps a local copy. If two people edit the same item at once, the latest update wins. Voice recordings are not shared. Free STUN is used without a TURN relay, so some strict networks may not connect.')],
      actions: [...actions, { label: 'Done', kind: 'ghost' }] });
  }

  function setGroupStatus(message) {
    groupStatusText = message;
    document.querySelectorAll('.group-room-modal .group-status').forEach(el => { el.textContent = message; });
  }

  async function receiveGroupState() {
    if (st.spent.length && m.slips && !m._pages[m.slips.src]) {
      try { await loadSlips(m); } catch (e) { toast(e.message || 'Could not load the shared Authority results.'); }
    }
    if (st.accusations.length && !m._sealed) {
      try { await loadSealed(m); } catch (e) { toast(e.message || 'Could not load the shared accusation results.'); }
    }
    saveState(st);
    if (st.status === 'signing') {
      if (!groupTransition) { groupTransition = true; setTimeout(() => go(`#/play/${m.id}`), 250); }
      return;
    }
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('input, textarea, select, [contenteditable]');
    if (!typing) {
      renderAll();
      if (ui.drawer) openDrawer(ui.drawer);
    }
    if (board && board.refresh) board.refresh();
  }

  const tick = setInterval(() => { if (clockText) clockText.textContent = fmtClock(timerNow(st)); }, 1000);
  const autosave = setInterval(() => { timerRebase(st); saveState(st); }, 15000);
  on(window, 'pagehide', () => { timerRebase(st); saveState(st); });
  on(document, 'visibilitychange', () => { if (document.hidden) { timerRebase(st); saveState(st); } });

  /* --- the desk surface --------------------------------------------------------- */
  function trayFor(id) {
    const d = reg.get(id);
    if (d.kind === 'brief') return ['brief', 'Briefing'];
    if (d.kind === 'base') return ['base', m.groups.base];
    if (d.kind === 'file') return [`file-${d.file}`, `File ${d.file} · ${fileName(d.file)}`];
    if (d.kind === 'slip') return ['slip', 'Returned inquiries'];
    return ['reconsider', 'Reconsider'];
  }

  function folder(id) {
    const d = reg.get(id);
    const unread = !st.read[id];
    const hl = d.pages.reduce((a, _, i) => a + ((st.highlights[`${id}#${i}`] || []).length), 0);
    return h('button', {
      class: `folder k-${d.kind}${d.cover ? ' cover' : ''}${unread ? ' unread' : ''}`,
      style: { '--tilt': `${tilt(id)}deg` },
      onclick: () => openReader(id),
      title: d.title,
      dataset: { doc: id },
    },
    h('span', { class: 'folder-tab' }, refOf(id)),
    h('span', { class: 'folder-body' },
      h('span', { class: 'folder-label' }, d.title),
      h('span', { class: 'folder-meta' }, plural(d.pages.length, 'page'), hl ? ` · ${hl} marked` : '')),
    unread ? h('span', { class: 'clip', 'aria-label': 'Unread' }, 'New') : null);
  }

  function lockedBundles() {
    if (!phased) return [];
    return m.phases.slice(st.phase).map((p, i) => {
      const n = p.docs.flatMap(expand).length;
      return h('button', { class: 'folder bundle', style: { '--tilt': `${tilt('ph' + i)}deg` },
        onclick: () => { sfx.tick(); toast(`Sealed until Phase ${st.phase + i + 1}. Answer the memo to open the next phase.`); } },
      h('span', { class: 'folder-tab' }, `Phase ${st.phase + i + 1}`),
      h('span', { class: 'folder-body' }, h('span', { class: 'folder-label' }, `Sealed: ${p.read}`), h('span', { class: 'folder-meta' }, plural(n, 'document'))),
      h('span', { class: 'tape' }, 'Sealed'));
    });
  }

  function memo() {
    if (phased) {
      const p = m.phases[st.phase - 1];
      const last = st.phase === m.phases.length;
      const val = st.hypotheses[st.phase] || '';
      const btn = h('button', { class: 'stamp-btn sm', disabled: !val.trim(), onclick: advancePhase }, h('span', {}, `Open Phase ${st.phase + 1}`));
      return h('div', { class: 'memo' },
        h('span', { class: 'pin' }),
        h('div', { class: 'memo-head' }, h('b', {}, 'Memo · Case Review Unit'), h('span', {}, `Phase ${st.phase} of ${m.phases.length}`)),
        h('p', { class: 'memo-read' }, `Read ${p.read}.`),
        last ? h('p', { class: 'memo-q' }, 'Everything is open. Write up the Resolution Sheet and accuse when you are ready.') : [
          h('p', { class: 'memo-q' }, p.prompt),
          h('textarea', { class: 'hand', rows: 3, value: val, 'aria-label': p.prompt, placeholder: 'Write it here before you move on...',
            oninput: e => { st.hypotheses[st.phase] = e.target.value; btn.disabled = !e.target.value.trim(); save(); } }),
          btn]);
    }
    return h('div', { class: 'memo' },
      h('span', { class: 'pin' }),
      h('div', { class: 'memo-head' }, h('b', {}, 'Memo · Case Review Unit'), h('span', {}, 'Standing orders')),
      h('p', { class: 'memo-q' }, 'The documents do not lie. People might. Spend Authorities only on what the file points at. Write every step down, with a citation, before you accuse.'),
      h('button', { class: 'linkbtn', onclick: () => openReader('BRIEF') }, 'Re-read the briefing'));
  }

  function envelopes() {
    const gate = authoritiesOpen(m, st);
    return h('div', { class: 'env-tray' },
      m._menu.map(a => {
        const spent = st.spent.find(s => s.n === a.n);
        const locked = !spent && !gate.ok;
        return h('button', {
          class: `mini-env${spent ? ' opened' : ''}${locked ? ' locked' : ''}`,
          style: { '--tilt': `${tilt('e' + a.n) * 1.4}deg` },
          title: `${a.text} (${a.to})`,
          onclick: () => (spent ? openReader(`SLIP ${a.n}`) : spend(a)),
        },
        h('span', { class: 'mini-flap' }),
        h('span', { class: 'mini-n' }, a.n),
        h('span', { class: 'mini-label' }, a.text),
        spent ? h('span', { class: 'mini-state' }, 'Opened') : h('span', { class: 'mini-seal' }));
      }));
  }

  /* --- persons of interest ---------------------------------------------------- */
  const statusCls = s => `s-${s.toLowerCase()}`;
  function personCard(p) {
    const rec = st.sheet.persons[p.id];
    const note = ((st.people || {})[p.id] || {}).note;
    return h('button', {
      class: `poi-card ${statusCls(rec.status)}`,
      style: { '--tilt': `${tilt('p' + p.id) * 1.3}deg` },
      onclick: () => openPerson(p),
      title: `${fullName(p)} · ${p.role}`,
      dataset: { person: p.id },
    },
    h('span', { class: 'poi-pin' }),
    portrait(m, p),
    h('span', { class: 'poi-name' }, surname(p)),
    h('span', { class: 'poi-role' }, p.role),
    rec.status !== 'Open' ? h('span', { class: 'poi-stamp' }, rec.status) : null,
    note && note.trim() ? h('span', { class: 'poi-noted', title: 'You have a note on this person' }, icon('notes')) : null);
  }

  // A file card for one person: their finding (the same one as on the
  // Resolution Sheet), where the readable documents mention them, and a note.
  function openPerson(p) {
    sfx.paper();
    st.people ||= {};
    const mine = st.people[p.id] ||= { note: '' };
    const rec = st.sheet.persons[p.id];
    const found = mentions(m, reg, available(), p);
    const sel = h('select', { class: `hand-select ${statusCls(rec.status)}`, 'aria-label': `Finding for ${fullName(p)}`, value: rec.status,
      onchange: e => { rec.status = e.target.value; e.target.className = `hand-select ${statusCls(rec.status)}`; save(); sfx.tick(); renderDesk(); } },
    m.persons.statuses.map(o => h('option', { value: o }, o)));
    let close;
    const docBtn = ({ id, n }) => h('button', { class: 'pc-doc', onclick: () => { close(); openReader(id); } },
      h('span', { class: 'pc-ref' }, refOf(id)), h('span', { class: 'pc-title' }, reg.get(id).title), h('span', { class: 'pc-n' }, `x${n}`));
    ({ close } = modal({
      kicker: `Person of interest · Case ${m.number}`, title: fullName(p), className: 'person-modal',
      body: h('div', { class: 'pc' },
        h('div', { class: 'pc-photo' }, portrait(m, p, 'lg'), h('span', { class: 'pc-plate' }, p.role)),
        h('div', { class: 'pc-body' },
          h('label', { class: 'pc-field' }, h('span', { class: 'pc-l' }, 'Your finding'), sel),
          h('p', { class: 'pc-hint' }, 'The same finding as on your Resolution Sheet. Cite the evidence for it there.'),
          h('div', { class: 'pc-l' }, found.length ? `Named in ${plural(found.length, 'document')} you can read` : 'Not named in anything you can read yet'),
          found.length ? h('div', { class: 'pc-docs' }, found.map(docBtn)) : null,
          h('label', { class: 'pc-field' }, h('span', { class: 'pc-l' }, 'Your note'),
            h('textarea', { class: 'hand', rows: 3, value: mine.note, placeholder: 'Alibi, motive, what does not add up...',
              oninput: e => { mine.note = e.target.value; save(); } })))),
      actions: [{ label: 'Back to the desk', kind: 'primary' }],
      onClose: () => { renderDesk(); refocus(null, `.poi-card[data-person="${CSS.escape(p.id)}"]`); },
    }));
  }

  /* --- evidence board ------------------------------------------------------------ */
  let board = null;
  function showBoard() {
    if (board) return;
    sfx.paper();
    board = openBoard({ m, st, save, ids: available(), reg, refOf, onOpenDoc: id => openReader(id), behind: game });
    board.onClose = () => { board = null; renderDesk(); refocus(null, '.board-thumb'); };
  }

  /* --- exhibits ------------------------------------------------------------------ */
  function exhibitTray(ids) {
    const list = visibleExhibits(m, ids);
    if (!list.length) return null;
    return h('div', { class: 'tray t-exhibits' }, h('h3', { class: 'tray-h' }, 'Exhibits'),
      h('div', { class: 'bag-row' }, list.map(x => h('button', {
        class: 'bag-btn', style: { '--tilt': `${tilt('x' + x.ref) * 1.6}deg` },
        onclick: () => openExhibit(x), title: `${x.ref} · ${x.name}`, dataset: { ex: x.ref },
      }, evidenceBag(x)))));
  }

  function openExhibit(x) {
    sfx.paper();
    const src = refOf(x.source);
    const line = `${x.ref}: ${x.name} - ${x.missing ? 'not recovered. ' : ''}${x.found}${x.time ? `, ${x.time}` : ''} (${x.source})`;
    modal({
      kicker: `Exhibit · recorded in ${src}`, title: x.name, className: 'exhibit-modal',
      body: h('div', { class: 'xc' }, evidenceBag(x, { big: true }),
        h('dl', { class: 'xc-facts' },
          h('dt', {}, 'Reference'), h('dd', {}, x.ref),
          h('dt', {}, x.missing ? 'Searched for' : 'Found'), h('dd', {}, x.found),
          x.time ? [h('dt', {}, 'Time'), h('dd', { class: 'mono' }, x.time)] : null,
          h('dt', {}, 'Cite as'), h('dd', { class: 'mono' }, x.source))),
      actions: [
        { label: 'Copy to notebook', icon: 'quote', close: false, onClick: b => {
          st.notes = st.notes.trim() ? `${st.notes.replace(/\s*$/, '')}\n${line}` : line;
          save(); sfx.tick(); toast('Copied to your notebook'); b.disabled = true;
        } },
        { label: `Read ${src}`, kind: 'primary', icon: 'file', onClick: () => { setTimeout(() => openReader(x.source), 0); } },
      ],
    });
  }

  function tool(cls, title, sub, onclick, inner) {
    return h('button', { class: `tool ${cls}`, onclick, title: title.replace(/\u00ad/g, ''), dataset: { tool: cls } }, inner, h('span', { class: 'tool-label' }, title), sub ? h('span', { class: 'tool-sub' }, sub) : null);
  }

  function renderDesk() {
    const ids = available();
    const trays = new Map();
    for (const id of ids) {
      const [key, label] = trayFor(id);
      if (!trays.has(key)) trays.set(key, { label, ids: [] });
      trays.get(key).ids.push(id);
    }
    const done = st.sheet.steps.filter(s => s.text.trim() && s.cites.length).length;
    const unread = ids.filter(id => !st.read[id]).length;
    const gate = authoritiesOpen(m, st);
    citeList.replaceChildren(...ids.filter(id => reg.get(id).kind !== 'brief').map(id => h('option', { value: refOf(id) === 'Reconsider' ? id : refOf(id).replace(/^Authority /, 'SLIP ') })));

    surface.replaceChildren(h('div', { class: 'dk-grid' },
      h('section', { class: 'dk-files' },
        h('div', { class: 'plate' }, 'Case file', h('span', {}, `${plural(ids.length, 'document')}${unread ? ` · ${unread} new` : ''}`)),
        h('div', { class: 'tray t-poi' }, h('h3', { class: 'tray-h' }, 'Persons of interest'),
          h('div', { class: 'poi-row' }, m.persons.list.map(personCard))),
        [...trays].filter(([k]) => k !== 'slip' && k !== 'reconsider').map(([k, t]) => h('div', { class: `tray t-${k}` },
          h('h3', { class: 'tray-h' }, t.label), h('div', { class: 'folders' }, t.ids.map(folder)))),
        exhibitTray(ids),
        phased && st.phase < m.phases.length ? h('div', { class: 'tray t-locked' }, h('h3', { class: 'tray-h' }, 'Still sealed'), h('div', { class: 'folders' }, lockedBundles())) : null,
        ['slip', 'reconsider'].filter(k => trays.has(k)).map(k => h('div', { class: `tray t-${k}` },
          h('h3', { class: 'tray-h' }, trays.get(k).label), h('div', { class: 'folders' }, trays.get(k).ids.map(folder))))),
      h('section', { class: 'dk-side' },
        memo(),
        h('div', { class: 'env-box' },
          h('div', { class: 'plate' }, 'Sealed Authorities', h('span', {}, `${remaining(st)} of ${st.budget} left`)),
          !gate.ok && remaining(st) > 0 ? h('p', { class: 'env-gate' }, icon('lock'), gate.why) : null,
          envelopes(),
          h('p', { class: 'env-advice' }, m.advice)),
        h('button', { class: 'board-thumb', onclick: showBoard, dataset: { tool: 't-board' }, title: 'Pin the case up and tie it together with string' },
          h('span', { class: 'bt-felt', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('b')),
          h('span', { class: 'bt-text' }, h('b', {}, 'Evidence board'), h('span', {}, boardSummary(st)))),
        h('div', { class: 'tools' },
          tool('t-clip', 'Resolution Sheet', `${done} of ${st.sheet.steps.length} steps written`, () => openDrawer('sheet'), h('span', { class: 'art clipboard' }, h('i'), h('i'), h('i'))),
          tool('t-note', 'Notebook', st.notes.trim() ? plural(st.notes.trim().split('\n').length, 'line') : 'Empty', () => openDrawer('notes'), h('span', { class: 'art notebook' })),
          tool('t-calc', 'Calculator', null, openCalculator, h('span', { class: 'art calculator' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i'))),
          tool('t-phone', 'Ask the Unit', hintsTaken(m, st).levels ? `${hintsTaken(m, st).cost} points spent` : 'Hints cost points', openHints, h('span', { class: 'art phone' }, h('i'))),
          tool('t-bell', 'Break\u00adthrough', st.breakthroughs.length ? plural(st.breakthroughs.length, 'logged', 'logged') : 'Ring it', logBreakthrough, h('span', { class: 'art bell' }))))));
  }

  /* --- reader ------------------------------------------------------------------- */
  // Keyboard focus: into the reader or drawer when it opens, back to where you
  // were when it closes. Whatever is covered is made inert so Tab cannot reach it.
  let readerReturn = null, drawerReturn = null;
  const syncInert = () => { surface.inert = !!(ui.reader || ui.drawer); reader.inert = !!(ui.drawer && innerWidth <= 900); };
  // The desk re-renders often, so the element focus came from may have been
  // replaced. Its twin is found again by its data key (folder, tool, person, exhibit).
  const twinOf = el => {
    const k = el && el.dataset && ['doc', 'tool', 'person', 'ex'].find(x => el.dataset[x] != null);
    return k ? document.querySelector(`${el.tagName.toLowerCase()}[data-${k}="${CSS.escape(el.dataset[k])}"]`) : null;
  };
  const refocus = (el, fallbackSel) => {
    const target = el && el.isConnected ? el : (twinOf(el) || (fallbackSel && document.querySelector(fallbackSel)));
    if (target && target.focus) target.focus();
  };
  function openReader(id, col = null) {
    if (!available().includes(id)) return;
    if (reader.hidden) { readerReturn = document.activeElement; readerReturnDoc = id; }
    const fresh = !st.read[id];
    st.read[id] = true;
    if (col === 1 && ui.compare !== null) ui.compare = id;
    else if (ui.compare !== null && ui.active === 1 && ui.reader) ui.compare = id;
    else ui.reader = id;
    save(); sfx.paper();
    renderReader(true);
    if (fresh) renderDesk();
    syncInert();
  }
  let readerReturnDoc = null;

  function closeReader() {
    stopTapes();
    ui.reader = null; ui.compare = null; ui.active = 0;
    reader.hidden = true; hideSel(); sfx.close();
    game.classList.remove('reading');
    renderDesk();
    syncInert();
    refocus(readerReturn, readerReturnDoc && `.folder[data-doc="${CSS.escape(readerReturnDoc)}"]`);
  }

  const tapes = new Map();
  let focusPages = false;
  const focusPage = new Map();
  const stopTapes = () => { tapes.forEach(t => t.destroy()); tapes.clear(); };
  function toggleTape(idx, col, paper, id) {
    if (tapes.has(idx)) { tapes.get(idx).destroy(); tapes.delete(idx); col.classList.remove('taping'); return; }
    const t = createTape(paper, { voices: m.voices || {}, label: `Interview tape · ${refOf(id)}`, short: refOf(id) });
    tapes.set(idx, t);
    col.classList.add('taping');
    col.insertBefore(t.el, col.querySelector('.rd-scroll'));
    t.el.querySelector('.tape-play').focus();
  }

  function column(id, idx) {
    const d = reg.get(id);
    const order = available();
    const k = order.indexOf(id);
    const pick = h('select', { class: 'rd-pick', 'aria-label': 'Change document', onchange: e => { ui.active = idx; openReader(e.target.value, idx); } },
      order.map(o => h('option', { value: o }, `${refOf(o)} · ${reg.get(o).title}`)));
    pick.value = id;
    const pages = renderPages(m, d, st.highlights);
    const pageIndex = Math.min(focusPage.get(id) || 0, Math.max(0, pages.length - 1));
    if (focusPages) pages.forEach((p, i) => { p.hidden = i !== pageIndex; });
    const paper = h('div', { class: 'paper rd-paper', style: { zoom: getSettings().docZoom } }, pages);
    const pageNav = focusPages ? h('div', { class: 'rd-page-nav', 'aria-label': 'Page by page reading' },
      h('button', { class: 'btn ghost sm', disabled: pageIndex === 0, onclick: () => { focusPage.set(id, pageIndex - 1); renderReader(); } }, icon('left'), 'Previous page'),
      h('span', { class: 'mono' }, `Page ${pageIndex + 1} of ${pages.length}`),
      h('button', { class: 'btn ghost sm', disabled: pageIndex >= pages.length - 1, onclick: () => { focusPage.set(id, pageIndex + 1); renderReader(); } }, 'Next page', icon('right'))) : null;
    const tapeBtn = tapeSupported() && hasTranscript(paper)
      ? h('button', { class: 'btn ghost sm tape-btn', title: 'Hear this interview read aloud by your device', onclick: () => { toggleTape(idx, col, paper, id); tapeBtn.classList.toggle('on', tapes.has(idx)); } }, icon('tape'), h('span', { class: 'blbl' }, 'Play tape'))
      : null;
    const col = h('div', { class: `rd-col ${ui.compare !== null && ui.active === idx ? 'active' : ''}`, dataset: { col: String(idx) } },
      h('div', { class: 'rd-col-head' },
        h('span', { class: 'rd-ref' }, refOf(id)), pick, tapeBtn,
        ui.compare !== null ? h('button', { class: 'iconbtn sm', title: 'Close this side', 'aria-label': 'Close this side', onclick: () => { if (idx === 0) { ui.reader = ui.compare; } ui.compare = null; ui.active = 0; renderReader(); } }, icon('close')) : null),
      pageNav,
      h('div', { class: 'rd-scroll' },
        paper,
        h('div', { class: 'rd-foot' },
          k > 0 ? h('button', { class: 'btn ghost sm', onclick: () => { ui.active = idx; openReader(order[k - 1], idx); } }, icon('left'), refOf(order[k - 1])) : h('span'),
          k < order.length - 1 ? h('button', { class: 'btn ghost sm', onclick: () => { ui.active = idx; openReader(order[k + 1], idx); } }, refOf(order[k + 1]), icon('right')) : h('span'))));
    col.addEventListener('mousedown', () => { if (ui.compare !== null && ui.active !== idx) { ui.active = idx; $$('.rd-col', reader).forEach((c, j) => c.classList.toggle('active', j === idx)); } });
    return col;
  }

  function renderReader(animate = false) {
    if (!ui.reader) return;
    stopTapes();
    const d = reg.get(ui.reader);
    reader.hidden = false;
    game.classList.add('reading');
    const cols = [column(ui.reader, 0)];
    if (ui.compare !== null) cols.push(column(ui.compare, 1));
    reader.replaceChildren(
      h('div', { class: 'rd-bar' },
        h('button', { class: 'btn ghost sm', onclick: closeReader }, icon('left'), 'Back to desk'),
        h('div', { class: 'rd-title' }, ui.compare !== null ? 'Comparing two documents' : d.title),
        h('div', { class: 'rd-tools' },
          h('button', { class: 'iconbtn sm', title: 'Smaller text', 'aria-label': 'Smaller text', onclick: () => zoom(-1) }, icon('zoomOut')),
          h('button', { class: 'iconbtn sm', title: 'Larger text', 'aria-label': 'Larger text', onclick: () => zoom(1) }, icon('zoomIn')),
          h('button', { class: `btn sm ${focusPages ? 'primary' : 'ghost'}`, 'aria-pressed': String(focusPages), onclick: () => { focusPages = !focusPages; renderReader(); } }, focusPages ? 'Show all pages' : 'One page at a time'),
          h('button', { class: 'btn ghost sm hl-clear', hidden: true, onclick: clearHighlights, title: 'Remove every highlight on the open document(s)' }, icon('eraser'), h('span', {}, 'Clear')),
          ui.compare === null ? h('button', { class: 'btn ghost sm wide-only', onclick: startCompare, title: 'Put a second document beside this one' }, icon('split'), 'Compare') : null,
          h('button', { class: `btn sm ${ui.drawer === 'sheet' ? 'primary' : 'ghost'}`, onclick: () => toggleDrawer('sheet') }, icon('sheet'), h('span', { class: 'blbl' }, 'Sheet')),
          h('button', { class: `btn sm ${ui.drawer === 'notes' ? 'primary' : 'ghost'}`, onclick: () => toggleDrawer('notes') }, icon('notes'), h('span', { class: 'blbl' }, 'Notes')))),
      h('div', { class: `rd-cols ${cols.length > 1 ? 'two' : ''} ${animate ? 'enter' : ''}` }, cols),
      h('p', { class: 'rd-hint' }, focusPages ? 'Take this page in at your own pace. Select a useful detail to highlight it. Esc returns to the desk.' : 'Select text to highlight it or quote it into your notebook. Esc returns to the desk.'));
    reader.querySelectorAll('.rd-scroll').forEach(s => { s.scrollTop = 0; });
    if (animate) { const back = reader.querySelector('.rd-bar .btn'); if (back && !reader.contains(document.activeElement)) back.focus(); }
    renderHlCount();
  }

  function startCompare() {
    const order = available();
    ui.compare = order[(order.indexOf(ui.reader) + 1) % order.length];
    ui.active = 1;
    renderReader();
    toast('Pick the second document from the menu above it, or with its arrows.');
  }

  function zoom(dir) {
    const i = ZOOMS.indexOf(getSettings().docZoom);
    const z = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))];
    setSetting('docZoom', z);
    $$('.rd-paper', reader).forEach(p => { p.style.zoom = z; });
    save();
  }

  /* --- highlights & quotes (inside the reader) ------------------------------------- */
  const selBar = h('div', { class: 'selbar', hidden: true });
  document.body.append(selBar);
  let selCtx = null;
  function hideSel() { selBar.hidden = true; selCtx = null; }
  function placeBar(rect) {
    selBar.hidden = false;
    const bw = selBar.offsetWidth, bh = selBar.offsetHeight;
    let y = rect.bottom + 8;
    if (y + bh > innerHeight - 20) y = rect.top - bh - 8;
    const x = Math.max(8, Math.min(innerWidth - bw - 8, rect.left + rect.width / 2 - bw / 2));
    selBar.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(8, y))}px)`;
  }
  const pageOf = node => { const el = node && (node.nodeType === 1 ? node : node.parentElement); return el && el.closest('.doc[data-key]'); };

  // Highlights are kept per page as sorted, non-overlapping ranges, so they
  // behave like a real highlighter: marking over a mark merges, and erasing
  // removes exactly the part you select.
  const hlId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function normalise(list) {
    const out = [];
    for (const r of [...list].sort((a, b) => a.s - b.s)) {
      const last = out[out.length - 1];
      if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
      else if (r.e > r.s) out.push({ s: r.s, e: r.e, id: r.id || hlId() });
    }
    return out;
  }
  for (const k of Object.keys(st.highlights)) st.highlights[k] = normalise(st.highlights[k] || []);

  function repaint(key) {
    $$(`.doc[data-key="${CSS.escape(key)}"]`, reader).forEach(pg => {
      $$('mark.hl', pg).forEach(mk => { const p = mk.parentNode; mk.replaceWith(...mk.childNodes); p.normalize(); });
      for (const r of st.highlights[key] || []) wrapRange(pg, r.s, r.e, r.id);
    });
    renderHlCount();
    refreshTimeline();
  }
  const overlaps = (key, s, e) => (st.highlights[key] || []).filter(r => r.s < e && r.e > s);
  const covered = (key, s, e) => (st.highlights[key] || []).some(r => r.s <= s && r.e >= e);

  on(document, 'selectionchange', debounce(() => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { if (selCtx && selCtx.type === 'sel') hideSel(); return; }
    const range = sel.getRangeAt(0);
    const pg = pageOf(range.commonAncestorContainer);
    if (!pg || !reader.contains(pg)) return hideSel();
    const offsets = rangeToOffsets(pg, range);
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!offsets || !text) return hideSel();
    selCtx = { type: 'sel', key: pg.dataset.key, doc: pg.dataset.doc, offsets, text };
    const hit = overlaps(selCtx.key, offsets.s, offsets.e).length > 0;
    const keep = e => e.preventDefault();
    selBar.replaceChildren(
      covered(selCtx.key, offsets.s, offsets.e) ? null : h('button', { onmousedown: keep, onclick: addHighlight }, icon('marker'), 'Highlight'),
      hit ? h('button', { onmousedown: keep, onclick: eraseSelection }, icon('eraser'), 'Remove highlight') : null,
      h('button', { onmousedown: keep, onclick: quoteSelection }, icon('quote'), 'Quote to notebook'));
    placeBar(range.getBoundingClientRect());
  }, 120));

  function addHighlight() {
    if (!selCtx) return;
    const { key, offsets } = selCtx;
    st.highlights[key] = normalise([...(st.highlights[key] || []), { s: offsets.s, e: offsets.e, id: hlId() }]);
    repaint(key);
    getSelection().removeAllRanges();
    hideSel(); save(); sfx.tick();
  }

  // Erase only the selected span, keeping any highlighted text either side of it.
  function eraseSelection() {
    if (!selCtx) return;
    const { key, offsets: { s, e } } = selCtx;
    const next = [];
    for (const r of st.highlights[key] || []) {
      if (r.e <= s || r.s >= e) { next.push(r); continue; }
      if (r.s < s) next.push({ s: r.s, e: s, id: hlId() });
      if (r.e > e) next.push({ s: e, e: r.e, id: hlId() });
    }
    st.highlights[key] = normalise(next);
    repaint(key);
    getSelection().removeAllRanges();
    hideSel(); save(); sfx.tick();
  }

  function quoteSelection() {
    if (!selCtx) return;
    const line = `"${selCtx.text}" (${refOf(selCtx.doc)})`;
    st.notes = st.notes ? `${st.notes.replace(/\s*$/, '')}\n${line}\n` : `${line}\n`;
    const ta = drawer.querySelector('.notes-ta');
    if (ta) ta.value = st.notes;
    getSelection().removeAllRanges();
    hideSel(); save(); refreshTimeline();
    toast('Quoted into the notebook');
  }

  // Clicking (or tapping) a highlight offers to remove that whole highlight.
  on(reader, 'click', e => {
    const mark = e.target.closest('mark.hl');
    if (!mark || !getSelection().isCollapsed) return;
    const pg = pageOf(mark);
    selCtx = { type: 'mark', key: pg.dataset.key, id: mark.dataset.hl };
    selBar.replaceChildren(h('button', { onclick: removeHighlight }, icon('eraser'), 'Remove highlight'));
    placeBar(mark.getBoundingClientRect());
  });
  on(document, 'mousedown', e => { if (!selBar.contains(e.target) && selCtx && selCtx.type === 'mark' && !e.target.closest('mark.hl')) hideSel(); });
  on(window, 'resize', hideSel);
  on(reader, 'scroll', hideSel, true);

  function removeHighlight() {
    const { key, id } = selCtx;
    st.highlights[key] = (st.highlights[key] || []).filter(x => x.id !== id);
    repaint(key);
    hideSel(); save(); sfx.tick();
  }

  // Every highlight on the documents currently open in the reader.
  const openKeys = () => [ui.reader, ui.compare].filter(Boolean).flatMap(id => reg.get(id).pages.map((_, i) => `${id}#${i}`));
  const hlCount = () => openKeys().reduce((a, k) => a + (st.highlights[k] || []).length, 0);
  function renderHlCount() {
    const btn = reader.querySelector('.hl-clear');
    if (!btn) return;
    const n = hlCount();
    btn.hidden = !n;
    btn.lastChild.textContent = `Clear ${n}`;
  }
  async function clearHighlights() {
    const n = hlCount();
    if (!n) return;
    const ok = await confirmModal({ title: `Clear ${plural(n, 'highlight')}?`, body: h('p', {}, 'This removes every highlight on the document(s) open in the reader.'), confirm: 'Clear highlights' });
    if (!ok) return;
    for (const k of openKeys()) { delete st.highlights[k]; repaint(k); }
    save(); toast('Highlights cleared');
  }

  /* --- phases --------------------------------------------------------------------- */
  function advancePhase() {
    if (st.phase >= m.phases.length) return;
    st.phase += 1;
    const p = m.phases[st.phase - 1];
    saveNow(); sfx.stamp();
    renderAll();
    toast(`Phase ${st.phase} is open: ${p.read}.`);
  }

  /* --- drawers: clipboard and notebook ---------------------------------------------- */
  function openDrawer(which) {
    if (!drawer.contains(document.activeElement)) drawerReturn = document.activeElement;
    ui.drawer = which;
    game.classList.add('drawer-open');
    drawer.hidden = false;
    drawer.className = `dw dw-${which}`;
    sfx.paper();
    drawer.replaceChildren(
      h('div', { class: 'dw-head' },
        h('b', {}, which === 'sheet' ? 'Case Resolution Sheet' : 'Notebook'),
        h('button', { class: 'iconbtn sm', 'aria-label': 'Put it down', title: 'Put it down (Esc)', onclick: closeDrawer }, icon('close'))),
      h('div', { class: 'dw-body' }, which === 'sheet' ? renderSheet() : renderNotes()));
    if (ui.reader) renderReader();
    syncInert();
    const first = drawer.querySelector('textarea, input, select, button:not(.iconbtn)');
    if (first) first.focus({ preventScroll: true });
  }
  function closeDrawer() {
    const was = ui.drawer;
    ui.drawer = null;
    drawer.hidden = true;
    game.classList.remove('drawer-open');
    sfx.close();
    renderDesk();
    if (ui.reader) renderReader();
    syncInert();
    refocus(drawerReturn, ui.reader ? '.rd-bar .btn' : `.tool[data-tool="${was === 'sheet' ? 't-clip' : 't-note'}"]`);
  }
  const toggleDrawer = which => (ui.drawer === which ? closeDrawer() : openDrawer(which));

  function markEarly(step) {
    if (step.early === null && step.text.trim() && step.cites.length) step.early = fileStillSplit(m, st);
  }

  // "B-1", "D-1 §2", "SLIP 3" or "Authority 03" -> the readable document it names, if any.
  function citeTarget(c) {
    const ids = available();
    const t = c.trim().toUpperCase().replace(/^AUTHORITY\s*/, 'SLIP ');
    const slip = /^SLIP\s*0*(\d{1,2})\b/.exec(t);
    if (slip) { const id = `SLIP ${slip[1].padStart(2, '0')}`; return ids.includes(id) ? id : null; }
    const tok = t.split(/[\s§(,;:]/)[0];
    return ids.find(id => id.toUpperCase() === tok) || null;
  }
  function openCited(id) {
    if (innerWidth <= 900 && ui.drawer) closeDrawer(); // on a phone the sheet covers the reader
    openReader(id);
  }

  function citeEditor(list, onChange) {
    const chips = h('div', { class: 'chips' });
    const draw = () => chips.replaceChildren(...list.map((c, i) => {
      const id = citeTarget(c);
      return h('span', { class: `chip ${id ? 'linked' : 'unknown'}`, title: id ? `Open ${refOf(id)}` : 'Not a document you can read in this file' },
        id ? h('button', { class: 'chip-go', onclick: () => openCited(id) }, c) : h('span', {}, c),
        h('button', { class: 'chip-x', 'aria-label': `Remove ${c}`, onclick: () => { list.splice(i, 1); draw(); onChange(); } }, icon('close')));
    }));
    const input = h('input', { class: 'cite-in', list: 'cite-list', placeholder: 'Cite, e.g. B-1', 'aria-label': 'Add a citation' });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      if (!list.some(c => c.toLowerCase() === v.toLowerCase())) list.push(v);
      input.value = ''; draw(); onChange(); sfx.tick();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    input.addEventListener('input', e => { if (e.inputType === undefined || e.inputType === 'insertReplacementText') add(); });
    draw();
    return h('div', { class: 'cites' }, h('span', { class: 'cites-l' }, 'Evidence'), chips, h('span', { class: 'cite-add' }, input, h('button', { class: 'cite-btn', onclick: add, 'aria-label': 'Add citation' }, '+')));
  }

  function renderSheet() {
    const s = st.sheet;
    const dbl = !!(m.reveal && m.reveal.double);
    const meter = h('div', { class: 'sheet-meter' });
    function drawMeter() {
      const cited = s.steps.filter(x => x.text.trim() && x.cites.length).length;
      const found = m.persons.list.filter(p => s.persons[p.id].status !== 'Open').length;
      meter.replaceChildren(
        h('div', { class: 'sm-steps', role: 'img', 'aria-label': `${cited} of ${s.steps.length} steps written and cited` },
          s.steps.map((x, i) => h('span', { class: `pip ${x.text.trim() && x.cites.length ? 'ok' : x.text.trim() ? 'half' : ''}`, title: `Step ${i + 1}` }))),
        h('span', { class: 'sm-l' }, h('b', {}, `${cited}/${s.steps.length}`), ' steps cited'),
        h('span', { class: 'sm-l' }, h('b', {}, `${found}/${m.persons.list.length}`), ' findings'),
        h('span', { class: `sm-l ${s.motive.trim() ? 'on' : ''}` }, s.motive.trim() ? 'Motive written' : 'No motive yet'));
    }
    drawMeter();
    const steps = m._steps.map((q, i) => {
      const step = s.steps[i];
      const mark = h('span', { class: 'tick' });
      const refresh = () => {
        const ok = step.text.trim() && step.cites.length;
        mark.className = `tick ${ok ? 'ok' : step.text.trim() ? 'half' : ''}`;
        mark.title = ok ? `Written and cited${dbl && step.early ? ` - ${m.scoring.doubleLabel}` : ''}` : step.text.trim() ? 'Needs a citation' : 'Not started';
        mark.textContent = ok ? (dbl && step.early ? 'Cited x2' : 'Cited') : step.text.trim() ? 'Cite?' : '';
      };
      const changed = () => { markEarly(step); refresh(); drawMeter(); save(); };
      refresh();
      return h('div', { class: 'form-step' },
        h('div', { class: 'form-q' }, h('span', { class: 'form-n' }, `${i + 1}.`), h('span', {}, q), mark),
        h('textarea', { class: 'hand', rows: 3, value: step.text, 'aria-label': q, oninput: e => { step.text = e.target.value; changed(); } }),
        citeEditor(step.cites, changed));
    });
    const persons = h('div', { class: 'form-step' },
      h('div', { class: 'form-q' }, h('span', {}, m.persons.label)),
      h('p', { class: 'form-hint' }, m.persons.hint),
      h('table', { class: 'form-table' }, m.persons.list.map(p => {
        const rec = s.persons[p.id];
        const sel = h('select', { class: `hand-select s-${rec.status.toLowerCase()}`, 'aria-label': `Finding for ${p.name}`, value: rec.status,
          onchange: e => { rec.status = e.target.value; e.target.className = `hand-select s-${rec.status.toLowerCase()}`; drawMeter(); save(); sfx.tick(); } },
        m.persons.statuses.map(o => h('option', { value: o }, o)));
        return h('tr', {}, h('td', { class: 'who' }, portrait(m, p, 'sm'), h('span', {}, h('b', {}, p.name), h('span', {}, p.role))), h('td', {}, sel), h('td', {}, citeEditor(rec.cites, save)));
      })));
    const motive = h('div', { class: 'form-step' },
      h('div', { class: 'form-q' }, h('span', {}, m.motiveLabel)),
      h('textarea', { class: 'hand', rows: 3, value: s.motive, 'aria-label': m.motiveLabel, oninput: e => { s.motive = e.target.value; drawMeter(); save(); } }));
    return h('div', { class: 'form' },
      h('div', { class: 'form-top' }, h('span', {}, `Case ${m.number}`), h('span', {}, 'Complete before the final accusation')),
      meter,
      h('p', { class: 'form-hint' }, 'Cite by document reference (B-1, D-1 §2, SLIP 03). A step with no citation scores nothing, however right it is.',
        dbl ? ' Steps marked x2 were established before the last phase opened and score double.' : ''),
      steps, persons, motive,
      h('button', { class: 'stamp-btn wide', onclick: accuse }, h('span', {}, 'Ready to accuse')));
  }

  /* --- timeline: every clock time you have highlighted or written down ------------- */
  const TIME = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g;
  function timelineEntries() {
    const ids = available();
    const out = [];
    const add = (mt, text, id, from) => out.push({ min: +mt[1] * 60 + +mt[2] + (mt[3] ? +mt[3] / 60 : 0), time: `${mt[1].padStart(2, '0')}:${mt[2]}${mt[3] ? `:${mt[3]}` : ''}`, text, id, from });
    for (const [key, list] of Object.entries(st.highlights)) {
      const [id, i] = [key.slice(0, key.lastIndexOf('#')), +key.slice(key.lastIndexOf('#') + 1)];
      if (!list || !list.length || !ids.includes(id)) continue;
      const d = reg.get(id);
      const page = pageNode(m, d.src, d.pages[i]).textContent;
      for (const r of list) {
        const t = page.slice(r.s, r.e).replace(/\s+/g, ' ').trim();
        for (const mt of t.matchAll(TIME)) add(mt, t, id, 'highlight');
      }
    }
    for (const line of st.notes.split('\n')) {
      const t = line.trim();
      const ref = /\(([^()]+)\)\s*$/.exec(t);
      for (const mt of t.matchAll(TIME)) add(mt, t, ref ? citeTarget(ref[1]) : null, 'note');
    }
    const seen = new Set();
    const list = out.filter(e => { const k = `${e.time}|${e.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
    // Cases run through the night, so the day starts after the longest quiet gap on the clock.
    const mins = [...new Set(list.map(e => e.min))].sort((a, b) => a - b);
    let start = 0, gap = -1;
    mins.forEach((x, j) => { const g = (x - mins[(j - 1 + mins.length) % mins.length] + 1440) % 1440 || 1440; if (g > gap) { gap = g; start = x; } });
    return list.sort((a, b) => ((a.min - start + 1440) % 1440) - ((b.min - start + 1440) % 1440));
  }
  let timelineBox = null;
  function drawTimeline() {
    if (!timelineBox || !timelineBox.isConnected) return;
    const tl = timelineEntries();
    timelineBox.replaceChildren(
      h('div', { class: 'nb-h' }, 'Timeline', tl.length ? h('span', { class: 'nb-count' }, plural(tl.length, 'moment')) : null),
      tl.length
        ? h('ol', { class: 'tl' }, tl.map(e => h('li', { class: `tl-${e.from}` },
          h('span', { class: 'tl-t' }, e.time),
          h('span', { class: 'tl-x' }, e.text.length > 160 ? `${e.text.slice(0, 157)}...` : e.text),
          e.id ? h('button', { class: 'tl-ref', onclick: () => openCited(e.id), title: `Open ${refOf(e.id)}` }, refOf(e.id)) : h('span', { class: 'tl-ref none' }, 'note'))))
        : h('p', { class: 'nb-empty' }, 'Highlight any line with a time in it, like 22:10, and it lands here in order. Times you write in the notebook count too.'));
  }
  const refreshTimeline = debounce(drawTimeline, 250);

  function renderNotes() {
    const hyp = phased ? Object.entries(st.hypotheses).filter(([, v]) => v.trim()) : [];
    timelineBox = h('div', { class: 'nb-sec nb-tl' });
    requestAnimationFrame(drawTimeline);
    return h('div', { class: 'nb' },
      timelineBox,
      hyp.length ? h('div', { class: 'nb-sec' }, h('div', { class: 'nb-h' }, 'Written at the phase gates'),
        hyp.map(([k, v]) => h('p', { class: 'nb-hyp' }, h('b', {}, `Phase ${k}: `), v))) : null,
      h('textarea', { class: 'hand notes-ta', value: st.notes, 'aria-label': 'Notebook',
        placeholder: 'Timelines, hunches, arguments...\nSelect text in any document and choose "Quote to notebook" to drop it here.',
        oninput: e => { st.notes = e.target.value; save(); refreshTimeline(); } }),
      st.breakthroughs.length ? h('div', { class: 'nb-sec' }, h('div', { class: 'nb-h' }, 'Breakthroughs'),
        h('ol', { class: 'bt-list' }, st.breakthroughs.map(b => h('li', {}, h('span', { class: 'mono' }, fmtClock(b.at)), b.note || 'Breakthrough')))) : null,
      takenHints().length ? h('div', { class: 'nb-sec' }, h('div', { class: 'nb-h' }, 'Advice from the Unit'),
        takenHints().map(([x, n]) => h('div', { class: 'nb-advice' }, h('b', {}, x.q), x.steps.slice(0, n).map(t => h('p', {}, t))))) : null);
  }

  /* --- hints: "Ask the Unit" ------------------------------------------------------- */
  const takenHints = () => (m.hints || []).map(x => [x, (st.hints || {})[x.id] || 0]).filter(([, n]) => n > 0);

  // Which hints fit the sheet right now. A hint names the steps and people it helps
  // with ("for"); the ones still blank or uncited come first. Only what is written
  // is looked at, never whether it is right, so no answers are needed for this.
  function hintFit(x) {
    const f = x.for || {};
    if (!(f.steps || []).length && !(f.persons || []).length) return { rank: 1, why: null };
    const list = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
    const stepsLeft = (f.steps || []).filter(i => { const s = st.sheet.steps[i]; return !(s && s.text.trim() && s.cites.length); });
    const peopleLeft = (f.persons || []).filter(id => { const r = st.sheet.persons[id]; return !(r && r.status !== 'Open' && r.cites.length); });
    if (stepsLeft.length || peopleLeft.length) {
      const bits = [];
      if (stepsLeft.length === 1) { const s = st.sheet.steps[stepsLeft[0]]; bits.push(`step ${stepsLeft[0] + 1}, which ${s && s.text.trim() ? 'has no citation yet' : 'is not written yet'}`); }
      else if (stepsLeft.length) bits.push(`steps ${list(stepsLeft.map(i => i + 1))}, not finished yet`);
      const names = peopleLeft.map(id => fullName(m.persons.list.find(p => p.id === id)));
      if (names.length) bits.push(`${list(names)}, still without a finding and evidence`);
      return { rank: 0, why: `For ${bits.join('; and for ')}` };
    }
    const done = [...(f.steps || []).map(i => `step ${i + 1}`), ...(f.persons || []).map(id => fullName(m.persons.list.find(p => p.id === id)))];
    return { rank: 2, why: `${list(done).replace(/^./, c => c.toUpperCase())} ${done.length > 1 ? 'are' : 'is'} done: this can help you check it` };
  }

  function openHints() {
    sfx.tick();
    st.hints ||= {};
    const costs = hintCosts(m);
    const list = h('div', { class: 'hints' });
    const draw = () => {
      const ids = available();
      const open = (m.hints || []).filter(x => !x.needs || ids.includes(x.needs))
        .map((x, i) => ({ x, i, fit: hintFit(x) })).sort((a, b) => a.fit.rank - b.fit.rank || a.i - b.i);
      const taken = hintsTaken(m, st);
      total.textContent = taken.levels ? `So far: ${plural(taken.levels, 'hint')}, -${taken.cost} points.` : 'You have not asked for any help yet.';
      list.replaceChildren(...(open.length ? open.map(({ x, fit }) => {
        const n = st.hints[x.id] || 0;
        const more = n < x.steps.length;
        return h('div', { class: `hint ${n ? 'asked' : ''} ${fit.rank === 0 ? 'fits' : fit.rank === 2 ? 'later' : ''}` },
          h('div', { class: 'hint-q' }, h('b', {}, x.q), h('span', { class: 'hint-lv' }, `${n} of ${x.steps.length}`)),
          fit.why ? h('p', { class: 'hint-why' }, fit.why) : null,
          x.steps.slice(0, n).map((t, i) => h('p', { class: 'hint-a' }, h('span', { class: 'hint-n' }, `${i + 1}`), t)),
          more ? h('button', { class: 'btn sm', onclick: () => { st.hints[x.id] = n + 1; save(); sfx.tick(); draw(); renderDesk(); } },
            icon('help'), n ? `Ask for more (-${costs[n]} points)` : `Ask (-${costs[0]} points)`)
            : h('p', { class: 'hint-done' }, 'That is everything the Unit can tell you.'));
      }) : [h('p', { class: 'muted' }, 'Read further into the file first. The Unit can help once you have something to ask about.')]));
    };
    const total = h('p', { class: 'hint-total' });
    modal({
      kicker: 'Case Review Unit · advice line', title: 'Ask the Unit', className: 'wide hints-modal',
      body: [h('p', {}, `Stuck? Each question has up to three answers, from a gentle nudge to nearly the answer. They cost ${costs.join(', ')} points in turn, taken off your final score.`), total, list],
      actions: [{ label: 'Back to the desk', kind: 'primary' }],
    });
    draw();
  }

  /* --- calculator ------------------------------------------------------------------ */
  function openCalculator() {
    sfx.tick();
    let expr = '';
    const screen = h('div', { class: 'lcd-expr' }, '0');
    const result = h('div', { class: 'lcd-res' }, '');
    const show = () => { screen.textContent = expr || '0'; const v = calc(expr); result.textContent = expr && v != null ? `= ${v}` : ''; };
    const press = k => {
      sfx.tick();
      if (k === 'C') expr = '';
      else if (k === 'DEL') expr = expr.slice(0, -1);
      else if (k === '=') { const v = calc(expr); if (v != null) expr = String(v); }
      else if (expr.length < 60) expr += k;
      show();
    };
    const keys = ['C', 'DEL', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
    const label = { '/': '÷', '*': '×', '-': '−', DEL: '⌫' };
    const dlg = modal({
      title: 'Desk calculator', className: 'calc-modal',
      body: h('div', { class: 'calculator-big' },
        h('div', { class: 'lcd' }, screen, result),
        h('div', { class: 'keys' }, keys.map(k => h('button', { class: `key ${/[0-9.]/.test(k) ? 'num' : k === '=' ? 'eq' : 'op'}`, onclick: () => press(k) }, label[k] || k))),
        h('p', { class: 'hint' }, 'Type on your keyboard too. Enter for =, Backspace to delete.')),
    });
    const onKey = e => {
      if (!document.body.contains(dlg.el)) return document.removeEventListener('keydown', onKey);
      if (/^[0-9.+\-*/()]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { press('='); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('DEL'); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'c') press('C');
    };
    document.addEventListener('keydown', onKey);
  }

  /* --- breakthrough bell ---------------------------------------------------------- */
  function logBreakthrough() {
    sfx.bell();
    const at = timerNow(st);
    const inp = h('input', { class: 'field', placeholder: 'e.g. The thermometer was in the wrong room', autofocus: true });
    const commit = () => {
      st.breakthroughs.push({ at, note: inp.value.trim() });
      saveNow();
      toast(`Breakthrough logged at ${fmtClock(at)}`);
      renderDesk();
      if (ui.drawer === 'notes') openDrawer('notes');
    };
    const dlg = modal({
      kicker: `Ding. At ${fmtClock(at)}`, title: 'What just clicked?',
      body: [inp, h('p', { class: 'hint' }, 'Optional. The debrief shows when each breakthrough happened.')],
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Log it', kind: 'primary', onClick: commit }],
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); dlg.close(); } });
  }

  /* --- authorities ------------------------------------------------------------------ */
  function spend(a) {
    const gate = authoritiesOpen(m, st);
    if (!gate.ok) { sfx.tick(); return toast(gate.why); }
    const reason = h('textarea', { class: 'field', rows: 2, placeholder: 'Point at the document that made you want this.' });
    modal({
      kicker: `Sealed Authority ${a.n} · ${a.to}`,
      title: 'Break this seal?',
      body: [
        h('p', { class: 'lead', html: a.html }),
        h('div', { class: 'callout' }, `You will have ${remaining(st) - 1} of ${st.budget} left. Authorities do not come back, and not every one returns something useful.`),
        h('label', { class: 'lbl' }, 'What in the file made you want this?', reason),
        h('p', { class: 'hint' }, 'Optional, but say it out loud. If you cannot answer, do not buy it.'),
      ],
      actions: [
        { label: 'Leave it sealed', kind: 'ghost' },
        { label: 'Spend it', kind: 'primary', icon: 'envelope', onClick: () => { doSpend(a, reason.value.trim()); } },
      ],
    });
  }

  async function doSpend(a, reason) {
    st.spent.push({ n: a.n, at: timerNow(st), reason });
    saveNow();
    renderTop();
    const ready = loadSlips(m); // fetched while the envelope opens
    const opened = openEnvelope({ kicker: `Authority ${a.n}`, label: a.text, sub: `Returned by ${a.to}` });
    setTimeout(sfx.seal, 100);
    await opened;
    try { await ready; } catch (e) { toast(String(e.message || e)); return; }
    renderDesk();
    openReader(`SLIP ${a.n}`);
  }

  /* --- help ------------------------------------------------------------------------ */
  function showHelp() {
    const digital = [
      'Click a folder to read it. Compare puts a second document beside the first (wide screens).',
      'Select text in a document to highlight it or quote it into your notebook. Click a highlight to remove it.',
      'Click a sealed envelope to spend that Authority. Its result arrives as a folder under Returned inquiries.',
      'The clipboard holds your Resolution Sheet. Open it while reading: it docks beside the document.',
      'Ring the bell when something clicks. Click the stopwatch to pause. Progress saves automatically.',
    ];
    modal({
      kicker: `Case ${m.number} · ${m.title}`, title: 'How this works', className: 'wide',
      body: [
        h('h3', { class: 'sub' }, 'The rules'), h('ol', { class: 'rules' }, m.rules.map(r => h('li', {}, r))),
        h('h3', { class: 'sub' }, 'On the desk'), h('ul', { class: 'rules' }, digital.map(r => h('li', {}, r))),
      ],
      actions: [
        { label: 'Abandon this investigation', kind: 'ghost danger-text', close: false, onClick: async () => {
          const ok = await confirmModal({ title: 'Abandon this investigation?', body: h('p', {}, 'Your sheet, notes and spent Authorities on this device will be deleted. This cannot be undone.'), confirm: 'Delete progress', danger: true });
          if (ok) { clearState(m.id); go('#/'); }
          return ok;
        } },
        { label: 'Take the tour', kind: 'ghost', onClick: () => { setTimeout(coach, 250); } },
        m.tutorial && st.setup.guide === 'off' ? { label: 'Guide me again', kind: 'ghost', onClick: () => { st.setup.guide = 'mixed'; if (st.guide) st.guide.handed = false; save(); toast('The guide is back. Reload the desk to see it.'); setTimeout(() => go(`#/play/${m.id}`), 300); } } : null,
        { label: 'Back to the desk', kind: 'primary' },
      ],
    });
  }

  let endTour = null;
  function coach() {
    if (endTour) return;
    endTour = runTour([
      { sel: '.memo', title: phased ? 'The memo' : 'Standing orders',
        text: phased ? 'The file opens in phases. Read what the memo names, write your answer on it, then stamp it to unseal the next bundle.'
          : 'The Unit\'s standing orders. The documents do not lie; people might.' },
      { sel: '.dk-files .folder', title: 'Folders', text: 'Every document you may read. Click one to pick it up. New ones carry a red clip. Select text inside to highlight it or quote it into your notebook.' },
      { sel: '.t-poi', title: 'Persons of interest', text: 'Everyone the file names. Click a photo to record your finding, jot a note, and see which documents mention them.' },
      { sel: '.t-exhibits', title: 'Exhibits', text: 'The physical evidence, bagged and labelled exactly as the file records it. A new bag appears when a document you can read lists it.' },
      { sel: '.board-thumb', title: 'Evidence board', text: 'Pin people, exhibits and documents to a green board and tie them together with red string. Voice notes and index cards go up there too.' },
      { sel: '.env-tray', title: 'Sealed Authorities', text: `${st.budget} envelopes you may open. Each is one line of inquiry and they do not come back. Spend them on what the file points at.` },
      { sel: '.tool.t-clip', title: 'The Resolution Sheet', text: 'Write each step with a document citation as you establish it. Only what is written, with a citation, scores.' },
      { sel: '.tool.t-note', title: 'Your notebook', text: 'Timelines, hunches and quotes. It opens beside the document you are reading.' },
      { sel: '.tool.t-phone', title: 'Ask the Unit', text: 'Stuck? Phone for a hint. Each one costs points, so try on your own first.' },
      { sel: '.tool.t-bell', title: 'The bell', text: 'Ring it when something clicks. The debrief shows when each breakthrough happened.' },
      { sel: '.watch', title: 'The clock', text: 'It runs while you play and your time goes on the leaderboard. Click it to pause.' },
      { sel: '.dk-top .stamp-btn', title: 'Accuse', text: 'When you are sure, stamp an accusation. Two wrong ones are allowed; the third is final. Then Envelope S-1 reveals the truth.' },
      { sel: '.dk-actions .iconbtn[aria-label="Rules and help"]', title: 'Rules and help', text: 'The full rules, and this tour again whenever you want it.' },
    ], { onDone: () => { endTour = null; st.ui.coach = true; save(); } });
  }

  /* --- accusation ------------------------------------------------------------------- */
  function accuse() {
    sfx.tick();
    const n = st.accusations.length + 1;
    const final = n >= 3;
    const missing = st.sheet.steps.map((s, i) => [s, i + 1]).filter(([s]) => !s.text.trim() || !s.cites.length).map(([, i]) => i);
    let choice = null;
    const tried = new Set(st.accusations.map(a => a.option));
    const opts = m.accusation.options.map(o => h('label', { class: `opt ${tried.has(o.id) ? 'tried' : ''}` },
      h('input', { type: 'radio', name: 'acc', value: o.id, disabled: tried.has(o.id), onchange: () => { choice = o; dlg.buttons[1].disabled = false; } }),
      h('span', { class: 'opt-main' }, h('b', {}, o.label), h('span', { class: 'muted' }, tried.has(o.id) ? 'Already returned' : o.sub)),
      o.final ? h('span', { class: 'tag' }, 'Closes the review') : null));
    const dlg = modal({
      kicker: final ? 'Final accusation' : `Accusation ${n} of 3`,
      title: 'Charge sheet', className: 'wide charge',
      body: [
        h('p', {}, final ? 'This is your third accusation. It is final and will be scored as it stands.'
          : 'Two wrong accusations are allowed. Each costs 10 points and opens a Reconsider envelope naming the gap in your theory.'),
        missing.length
          ? h('div', { class: 'callout warn' }, `Resolution Sheet step${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'have' : 'has'} no working or no citation yet and would score nothing.`)
          : h('div', { class: 'callout ok' }, 'Every step on the Resolution Sheet has working and a citation.'),
        h('div', { class: 'acc-q' }, m.accusation.question),
        h('div', { class: 'opts' }, opts),
      ],
      actions: [
        { label: 'Back to the desk', kind: 'ghost' },
        { label: final ? 'Stamp the final accusation' : 'Stamp this accusation', kind: 'danger', disabled: true, onClick: () => { submitAccusation(choice, n); } },
      ],
    });
  }

  async function submitAccusation(o, n) {
    if (!o) return;
    // The answers are fetched now, at the moment of the accusation, and not before.
    try { await loadSealed(m); } catch (e) { toast(String(e.message || e)); return; }
    sfx.stamp();
    const isFinal = n >= 3 || !o.reconsider;
    const correct = o.type === m.accusation.determination && !o.reconsider;
    st.accusations.push({ option: o.id, at: timerNow(st), n, correct, final: isFinal, reconsider: isFinal ? null : o.reconsider.id });
    if (!isFinal) {
      saveNow();
      renderTop();
      const opened = openEnvelope({ kicker: 'Accusation returned', label: o.reconsider.title, sub: '-10 points. Go back to the table.', tone: 'red', button: 'Open the Reconsider envelope' });
      setTimeout(sfx.seal, 100);
      await opened;
      renderDesk();
      openReader(o.reconsider.id);
      toast(`${plural(3 - st.accusations.length, 'accusation')} left.`);
      return;
    }
    timerStop(st);
    st.final = { option: o.id, n, at: timerNow(st), signedBy: '' };
    st.status = 'signing';
    saveNow();
    go(`#/play/${m.id}`);
  }

  /* --- keyboard -------------------------------------------------------------------- */
  on(document, 'keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('.modal-wrap, .fx-overlay')) return;
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape') {
      if (typing) { e.target.blur(); return; }
      if (ui.drawer) { closeDrawer(); return; }
      if (ui.reader) { closeReader(); return; }
    }
    if (typing || !ui.reader) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const order = available();
      const cur = ui.compare !== null && ui.active === 1 ? ui.compare : ui.reader;
      const next = order[order.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) { e.preventDefault(); openReader(next, ui.active); }
    }
  });

  /* --- go ------------------------------------------------------------------------- */
  function renderAll() { renderTop(); renderDesk(); if (ui.reader) renderReader(); }
  renderAll();
  if (!st.ui.coach) coach();

  const guide = mountGuide({ m, st, save, host: game });

  return () => {
    if (endTour) endTour();
    guide.destroy();
    stopTapes();
    if (board) board.close();
    if (peerRoom) { const room = peerRoom; peerRoom = null; setTimeout(() => room.close(), 1200); }
    clearInterval(tick); clearInterval(autosave);
    listeners.forEach(off => off());
    selBar.remove();
    document.body.classList.remove('desk-lock');
    if (st.status === 'playing' && timerRunning(st)) timerStop(st, true);
    saveState(st);
  };
}
