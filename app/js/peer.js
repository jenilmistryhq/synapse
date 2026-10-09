// Small host-led WebRTC room. Supabase Realtime carries connection setup,
// anonymous room presence, and AES-GCM-encrypted state when a direct data
// channel is unavailable.

import { LEADERBOARD } from '../config.js';

const validUrl = u => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u || '');
const validKey = k => {
  if (typeof k !== 'string' || k.length < 20 || k.startsWith('sb_secret_')) return false;
  if (k.startsWith('sb_publishable_')) return /^[\w.-]+$/.test(k);
  const part = k.split('.')[1];
  if (!part) return /^[\w.-]+$/.test(k);
  try { return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { return false; }
};
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const makePeerId = randomToken;
export const makeRoomCode = () => `${randomToken()}.${randomToken()}`;
export const validRoomCode = code => /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/.test(String(code || '').trim());

function decode64(value) {
  const b64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
const encode64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encoder = new TextEncoder();
const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`
    : JSON.stringify(value);

async function roomKeys(secret) {
  if (!crypto.subtle) throw new Error('Secure group rooms need Web Crypto. Open the game on HTTPS or localhost.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  const derive = (info, algorithm, usages) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('project-synapse-room-v1'), info: encoder.encode(info) }, material, algorithm, false, usages);
  return {
    aes: await derive('state-encryption', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    hmac: await derive('signal-authentication', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify']),
  };
}

function collaborationState(st) {
  return JSON.parse(JSON.stringify({
    caseId: st.caseId,
    budget: st.budget,
    phase: st.phase,
    spent: st.spent || [],
    board: st.board || { cards: [], links: [] },
    notes: st.notes || '',
    people: st.people || {},
    hypotheses: st.hypotheses || {},
    accusations: st.accusations || [],
    final: st.final,
    status: st.status,
    sheet: st.sheet,
    read: st.read || {},
    highlights: st.highlights || {},
    groupActivity: st.groupActivity || [],
  }));
}

export function applyCollaborationState(st, data, allowedStatuses = [], optionIds = []) {
  if (!data || data.caseId !== st.caseId || !data.sheet || !Array.isArray(data.sheet.steps) || data.sheet.steps.length !== st.sheet.steps.length || !data.sheet.persons || typeof data.sheet.persons !== 'object') return false;
  const citesOk = cites => Array.isArray(cites) && cites.length <= 50 && cites.every(c => typeof c === 'string' && c.length <= 100);
  if (Object.keys(st.sheet.persons).some(id => !data.sheet.persons[id]) || data.sheet.steps.some(s => !s || typeof s.text !== 'string' || s.text.length > 10000 || !citesOk(s.cites))) return false;
  if (Object.entries(st.sheet.persons).some(([id]) => typeof data.sheet.persons[id].status !== 'string' || data.sheet.persons[id].status.length > 40 || allowedStatuses.length && !allowedStatuses.includes(data.sheet.persons[id].status) || !citesOk(data.sheet.persons[id].cites))) return false;
  if (typeof data.sheet.motive !== 'string' || data.sheet.motive.length > 10000 || typeof data.notes !== 'string' || data.notes.length > 100000) return false;
  if (!Number.isInteger(data.budget) || data.budget < 0 || data.budget > 20 || !Number.isInteger(data.phase) || data.phase < 1 || data.phase > 20 || !Array.isArray(data.spent) || data.spent.length > 20 || data.spent.some(x => !x || !/^\d{2}$/.test(x.n) || !Number.isFinite(x.at))) return false;
  if (!data.people || typeof data.people !== 'object' || Array.isArray(data.people) || Object.values(data.people).some(x => !x || typeof x.note !== 'string' || x.note.length > 10000)) return false;
  if (!data.hypotheses || typeof data.hypotheses !== 'object' || Array.isArray(data.hypotheses) || Object.values(data.hypotheses).some(x => typeof x !== 'string' || x.length > 10000)) return false;
  if (data.groupActivity != null && (!Array.isArray(data.groupActivity) || data.groupActivity.length > 40 || data.groupActivity.some(x => !x || typeof x.id !== 'string' || typeof x.actor !== 'string' || x.actor.length > 24 || typeof x.label !== 'string' || x.label.length > 100 || !Number.isFinite(x.at)))) return false;
  if (!Array.isArray(data.accusations) || data.accusations.length > 3 || data.accusations.some(x => !x || typeof x.option !== 'string' || x.option.length > 64 || optionIds.length && !optionIds.includes(x.option) || !Number.isFinite(x.at) || !Number.isInteger(x.n) || x.n < 1 || x.n > 3 || typeof x.correct !== 'boolean' || typeof x.final !== 'boolean' || x.reconsider != null && typeof x.reconsider !== 'string')) return false;
  if (!['playing', 'signing'].includes(data.status) || data.status === 'signing' && (!data.final || typeof data.final.option !== 'string' || optionIds.length && !optionIds.includes(data.final.option) || !Number.isInteger(data.final.n) || !Number.isFinite(data.final.at) || typeof data.final.signedBy !== 'string')) return false;
  const board = data.board;
  if (!board || !Array.isArray(board.cards) || board.cards.length > 300 || !Array.isArray(board.links) || board.links.length > 500) return false;
  if (board.cards.some(c => !c || typeof c.key !== 'string' || c.key.length > 100 || !['person', 'exhibit', 'doc', 'note', 'voice'].includes(c.kind) || !Number.isFinite(c.x) || !Number.isFinite(c.y) || typeof c.text === 'string' && c.text.length > 5000)) return false;
  st.board = board;
  st.budget = data.budget;
  st.phase = data.phase;
  st.spent = data.spent;
  st.notes = data.notes;
  st.people = data.people;
  st.hypotheses = data.hypotheses;
  st.accusations = data.accusations;
  st.final = data.final;
  st.status = data.status;
  st.sheet = data.sheet;
  st.read = data.read && typeof data.read === 'object' && !Array.isArray(data.read) ? data.read : {};
  st.highlights = data.highlights && typeof data.highlights === 'object' && !Array.isArray(data.highlights) ? data.highlights : {};
  st.groupActivity = data.groupActivity || [];
  return true;
}

export async function openPeerRoom({ roomCode, peerId, displayName = 'Investigator', host, state, statuses = [], optionIds = [], onState, onStatus, onMembers = () => {}, onActivity = () => {}, onConflict = () => {} }) {
  if (!validUrl(LEADERBOARD.url) || !validKey(LEADERBOARD.key)) throw new Error('Group rooms need a valid public Supabase project URL and anon key in app/config.js.');
  if (!validRoomCode(roomCode)) throw new Error('That room code is not valid.');
  const [roomId, secret] = roomCode.trim().split('.');
  const keys = await roomKeys(secret);

  const endpoint = new URL('/realtime/v1/websocket', LEADERBOARD.url);
  endpoint.protocol = 'wss:';
  endpoint.searchParams.set('apikey', LEADERBOARD.key);
  endpoint.searchParams.set('vsn', '1.0.0');
  const ws = new WebSocket(endpoint);
  const topic = `realtime:synapse-room-${roomId}`;
  const connections = new Map();
  const members = new Map();
  const relayRefs = new Set();
  const pendingIce = new Map();
  const room = { closed: false, joined: false, timer: null, ref: 0, joinRef: '1', role: host ? 'host' : 'guest' };
  let stateQueue = Promise.resolve();
  let relayingState = false;
  let lastLocalSnapshot = collaborationState(state);
  const safeName = String(displayName || 'Investigator').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Investigator';
  const nextRef = () => String(++room.ref);
  const send = msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ topic, join_ref: room.joinRef, ...msg })); };
  const reportMembers = () => onMembers([...members.values()].map(member => ({ ...member, self: member.peerId === peerId })));
  function readPresenceMeta(meta, fallbackKey) {
    if (!meta || typeof meta.peerId !== 'string' || !['host', 'guest'].includes(meta.role)) return null;
    const name = typeof meta.name === 'string' ? meta.name.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) : '';
    return { peerId: meta.peerId, role: meta.role, name: name || (meta.role === 'host' ? 'Host' : 'Investigator'), key: fallbackKey };
  }
  function syncPresence(payload) {
    members.clear();
    for (const [key, value] of Object.entries(payload || {})) {
      for (const meta of value && value.metas || []) {
        const member = readPresenceMeta(meta, key);
        if (member) members.set(member.peerId, member);
      }
    }
    reportMembers();
    if (!host && room.joined && [...members.values()].some(member => member.role === 'host')) signal('*', 'hello', null);
  }
  function updatePresence(payload) {
    let addedMember = false;
    for (const [key, value] of Object.entries(payload && payload.joins || {})) {
      for (const meta of value && value.metas || []) {
        const member = readPresenceMeta(meta, key);
        if (member) {
          if (!members.has(member.peerId)) addedMember = true;
          members.set(member.peerId, member);
        }
      }
    }
    for (const [key, value] of Object.entries(payload && payload.leaves || {})) {
      for (const meta of value && value.metas || []) {
        if (typeof meta.peerId === 'string') members.delete(meta.peerId);
        else for (const [id, member] of members) if (member.key === key) members.delete(id);
      }
    }
    reportMembers();
    if (host && addedMember) publishState(snapshot());
    if (!host && addedMember && [...members.values()].some(member => member.role === 'host')) signal('*', 'hello', null);
  }
  function trackPresence() {
    members.set(peerId, { peerId, role: room.role, name: safeName, key: peerId });
    reportMembers();
    send({ event: 'presence', ref: nextRef(), payload: { type: 'presence', event: 'track', payload: { peerId, role: room.role, name: safeName } } });
  }
  const signal = async (to, kind, data) => {
    const message = { from: peerId, to, kind, data, sentAt: Date.now() };
    const mac = await crypto.subtle.sign('HMAC', keys.hmac, encoder.encode(stableJson(message)));
    send({ event: 'broadcast', ref: nextRef(), payload: { type: 'broadcast', event: 'synapse-signal', payload: { ...message, mac: encode64(mac) } } });
  };
  const snapshot = () => collaborationState(state);

  function recordLocalActivity(data) {
    const before = lastLocalSnapshot || {};
    const changed = (key, label) => stableJson(before[key]) !== stableJson(data[key]) ? label : null;
    const labels = [
      changed('board', 'Updated the evidence board'), changed('notes', 'Edited the case notebook'),
      changed('people', 'Updated a person’s notes'), changed('hypotheses', 'Changed a theory'),
      changed('sheet', 'Edited the resolution sheet'), changed('read', 'Marked a document read'),
      changed('highlights', 'Changed document highlights'), changed('spent', 'Used an Authority'),
      changed('accusations', 'Updated an accusation'),
    ].filter(Boolean);
    lastLocalSnapshot = JSON.parse(JSON.stringify(data));
    if (!labels.length) return data;
    const current = Array.isArray(state.groupActivity) ? state.groupActivity : [];
    state.groupActivity = [...current, ...labels.map(label => ({ id: randomToken(), actor: safeName, label, at: Date.now() }))].slice(-40);
    onActivity(state.groupActivity);
    return snapshot();
  }

  async function encryptedState(data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, encoder.encode(JSON.stringify(data)));
    return JSON.stringify({ type: 'secure-state', iv: encode64(iv), cipher: encode64(cipher) });
  }
  function publishState(data) {
    stateQueue = stateQueue.then(async () => {
      data = recordLocalActivity(data);
      const open = [...connections.values()].filter(conn => conn.channel && conn.channel.readyState === 'open');
      const expected = host ? Math.max(0, members.size - 1) : (members.size > 1 ? 1 : 0);
      const useRelay = room.joined && (open.length < expected || !open.length && expected > 0);
      if (!open.length && !useRelay) return;
      const wire = await encryptedState(data);
      for (const conn of open) { try { conn.channel.send(wire); } catch { /* a peer may be leaving */ } }
      if (useRelay && ws.readyState === WebSocket.OPEN) {
        if (wire.length > 240 * 1024) {
          onStatus('Direct connection unavailable, and this update is too large for the encrypted relay. Keep it under 240 KB or reconnect directly.');
        } else {
          const ref = nextRef();
          relayRefs.add(ref);
          send({ event: 'broadcast', ref, payload: { type: 'broadcast', event: 'synapse-encrypted-state', payload: wire } });
          if (!relayingState) { relayingState = true; onStatus('Direct link unavailable. Sharing encrypted updates through the room relay.'); }
        }
      }
    }).catch(() => onStatus('Could not encrypt the shared investigation update.'));
    return stateQueue;
  }
  async function receiveStateWire(wire) {
    if (typeof wire !== 'string' || wire.length > 2_000_000) return;
    let envelope, data;
    try {
      envelope = JSON.parse(wire);
      if (envelope.type !== 'secure-state' || typeof envelope.iv !== 'string' || typeof envelope.cipher !== 'string') return;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(envelope.iv) }, keys.aes, decode64(envelope.cipher));
      data = JSON.parse(new TextDecoder().decode(plain));
    } catch { return; }
    if (!data || data.caseId !== state.caseId) { onStatus('This room is open on a different case.'); return; }
    const current = snapshot();
    const conflictKeys = ['board', 'notes', 'people', 'hypotheses', 'sheet', 'read', 'highlights', 'spent', 'accusations'];
    const conflicts = conflictKeys.filter(key => stableJson(current[key]) !== stableJson(lastLocalSnapshot[key]) && stableJson(data[key]) !== stableJson(current[key]));
    if (conflicts.length) onConflict({ sections: conflicts, localSnapshot: current, incomingActivity: data.groupActivity || [] });
    if (host) {
      if (!applyCollaborationState(state, data, statuses, optionIds)) return;
      lastLocalSnapshot = snapshot(); onActivity(state.groupActivity || []); publishState(snapshot()); onState();
    } else if (applyCollaborationState(state, data, statuses, optionIds)) { lastLocalSnapshot = snapshot(); onActivity(state.groupActivity || []); onState(); }
  }
  function setDataChannel(id, channel) {
    const conn = connections.get(id) || {};
    conn.channel = channel;
    connections.set(id, conn);
    channel.onopen = () => { onStatus(`Connected to ${connections.size} peer${connections.size === 1 ? '' : 's'}.`); if (host) publishState(snapshot()); };
    channel.onmessage = event => receiveStateWire(event.data);
    channel.onclose = () => onStatus(`A peer disconnected. ${connections.size} peer connection(s) remain.`);
    channel.onerror = () => onStatus('A peer connection reported an error.');
  }

  function createConnection(id) {
    if (connections.has(id) || connections.size >= 5) return null;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    const conn = { pc, channel: null, connectTimer: null };
    connections.set(id, conn);
    pc.onicecandidate = e => { if (e.candidate) signal(id, 'ice', e.candidate); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(conn.connectTimer);
        onStatus(`Encrypted connection established with ${connections.size} peer${connections.size === 1 ? '' : 's'}.`);
      } else if (['failed', 'closed'].includes(pc.connectionState)) {
        clearTimeout(conn.connectTimer);
        connections.delete(id);
        onStatus(`Peer connection ${pc.connectionState}. Some networks block direct connections; try another network.`);
      }
    };
    conn.connectTimer = setTimeout(() => {
      if (!['connected', 'failed', 'closed'].includes(pc.connectionState)) onStatus('Room member joined, but the encrypted peer link is still connecting. A network may be blocking direct connections.');
    }, 20000);
    pc.ondatachannel = e => setDataChannel(id, e.channel);
    return conn;
  }

  async function offerTo(id) {
    if (!('RTCPeerConnection' in window)) { onStatus('Direct peer links are unavailable here. Encrypted room relay is active.'); return; }
    const conn = createConnection(id);
    if (!conn) return;
    setDataChannel(id, conn.pc.createDataChannel('synapse-investigation', { ordered: true }));
    const offer = await conn.pc.createOffer();
    await conn.pc.setLocalDescription(offer);
    signal(id, 'offer', conn.pc.localDescription);
  }

  async function receiveSignal(msg) {
    if (!msg || !(msg.to === peerId || host && msg.to === '*') || msg.from === peerId || typeof msg.from !== 'string' || !Number.isFinite(msg.sentAt) || Math.abs(Date.now() - msg.sentAt) > 90000 || typeof msg.mac !== 'string') return;
    const { mac, ...signed } = msg;
    let verified = false;
    try { verified = await crypto.subtle.verify('HMAC', keys.hmac, decode64(mac), encoder.encode(stableJson(signed))); } catch { return; }
    if (!verified) return;
    if (host && msg.kind === 'hello') { try { await offerTo(msg.from); } catch { onStatus('Could not start a peer connection.'); } return; }
    if (!host && msg.kind === 'offer') {
      if (!('RTCPeerConnection' in window)) { onStatus('Direct peer links are unavailable here. Encrypted room relay is active.'); return; }
      let conn = connections.get(msg.from) || createConnection(msg.from);
      if (!conn) return;
      try {
        await conn.pc.setRemoteDescription(msg.data);
        for (const c of pendingIce.get(msg.from) || []) await conn.pc.addIceCandidate(c);
        pendingIce.delete(msg.from);
        await conn.pc.setLocalDescription(await conn.pc.createAnswer());
        signal(msg.from, 'answer', conn.pc.localDescription);
      } catch { onStatus('Could not accept the host connection. Check the room code and try again.'); }
      return;
    }
    const conn = connections.get(msg.from);
    if (msg.kind === 'answer' && host && conn) {
      try { await conn.pc.setRemoteDescription(msg.data); for (const c of pendingIce.get(msg.from) || []) await conn.pc.addIceCandidate(c); pendingIce.delete(msg.from); }
      catch { onStatus('Could not finish connecting to a peer.'); }
    } else if (msg.kind === 'ice') {
      if (!conn || !conn.pc.remoteDescription) {
        const list = pendingIce.get(msg.from) || []; list.push(msg.data); pendingIce.set(msg.from, list);
      } else { try { await conn.pc.addIceCandidate(msg.data); } catch { /* stale ICE after disconnect */ } }
    }
  }

  const connected = new Promise((resolve, reject) => {
    let settled = false;
    const joinRef = nextRef();
    room.joinRef = joinRef;
    const failJoin = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
      ws.close();
    };
    const timeout = setTimeout(() => failJoin(new Error('Room join timed out. Check the network and Supabase Realtime settings.')), 12000);
    ws.onopen = () => {
      send({ event: 'phx_join', ref: joinRef, payload: { config: { broadcast: { ack: true, self: false }, presence: { enabled: true }, private: false } });
    };
    ws.onerror = () => failJoin(new Error('Could not connect to Supabase Realtime. Check the network or project settings.'));
    ws.onclose = () => {
      if (!room.closed && !settled) failJoin(new Error('Realtime closed before this device joined the room.'));
      else if (room.joined && !room.closed) onStatus('Room signaling disconnected. Reopen Group play and reconnect with the saved room code.');
    };
    ws.onmessage = event => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.event === 'phx_reply' && msg.payload && !room.joined && String(msg.ref) === joinRef) {
        if (msg.payload.status !== 'ok') {
          const reason = msg.payload.response && (msg.payload.response.reason || msg.payload.response.message);
          failJoin(new Error(reason ? `Realtime rejected the room: ${reason}` : 'Realtime rejected the room join.'));
          return;
        }
        settled = true;
        room.joined = true;
        clearTimeout(timeout);
        trackPresence();
        if (host) publishState(snapshot());
        resolve();
        onStatus(host ? 'Room open. Share the invite code with your group and keep this tab open.' : 'Joined the room. Waiting for the host…');
        if (!host) signal('*', 'hello', null);
      } else if (msg.event === 'phx_reply' && relayRefs.has(String(msg.ref))) {
        relayRefs.delete(String(msg.ref));
        if (msg.payload && msg.payload.status !== 'ok') {
          const reason = msg.payload.response && (msg.payload.response.reason || msg.payload.response.message);
          onStatus(reason ? `Encrypted relay update failed: ${reason}` : 'Encrypted relay update failed. Check the Realtime payload limit.');
        }
      } else if (msg.event === 'presence_state') {
        syncPresence(msg.payload);
      } else if (msg.event === 'presence_diff') {
        updatePresence(msg.payload);
      } else if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'synapse-encrypted-state') {
        receiveStateWire(msg.payload.payload);
      } else if (['phx_error', 'phx_close'].includes(msg.event) && !room.joined) {
        const reason = msg.payload && (msg.payload.reason || msg.payload.message);
        failJoin(new Error(reason ? `Realtime room error: ${reason}` : 'Realtime closed the room channel.'));
      } else if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'synapse-signal') {
        const payload = msg.payload.payload;
        if (payload && payload.to === '*') {
          if (host && payload.kind === 'hello' && payload.from !== peerId) receiveSignal(payload);
        } else receiveSignal(payload);
      }
    };
  });
  await connected;
  room.publish = () => publishState(snapshot());
  room.close = () => {
    if (room.closed) return; room.closed = true; clearInterval(room.timer);
    for (const c of connections.values()) { clearTimeout(c.connectTimer); try { c.channel && c.channel.close(); c.pc.close(); } catch { /* already closed */ } }
    connections.clear();
    if (ws.readyState === WebSocket.OPEN) { send({ event: 'phx_leave', ref: nextRef() }); ws.close(1000, 'room left'); } else ws.close();
  };
  room.timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }));
  }, 25000);
  return room;
}
