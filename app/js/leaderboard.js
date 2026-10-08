// Scores: always kept on this device, and also posted to a shared Supabase
// table when app/config.js is filled in. Anything coming back from the server
// is treated as untrusted: anyone can call the API directly, bypassing the app.

import { store } from './util.js';
import { LEADERBOARD } from '../config.js';

const LOCAL = 'synapse:scores';
const LOCAL_MAX = 500;
const TIMEOUT = 10000;
export const MIN_TIME = 60 * 1000;

const validUrl = u => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u || '');
// Refuse a secret key: it bypasses row-level security, and anything in
// config.js is public. Only the anon / publishable key belongs there.
export function isSecretKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  const part = key.split('.')[1];
  if (!part) return false;
  try { return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon'; } catch { return false; }
}
let warned = false;
export const isGlobal = () => {
  const key = LEADERBOARD.key || '';
  if (!validUrl(LEADERBOARD.url) || !/^[\w.-]{20,}$/.test(key)) return false;
  if (isSecretKey(key)) {
    if (!warned) { console.error('[synapse] app/config.js holds a SECRET Supabase key. Remove it now and rotate it in Supabase; use the anon public key.'); warned = true; }
    return false;
  }
  return true;
};

const byRank = (a, b) => b.score - a.score || a.time_ms - b.time_ms;

function headers(extra = {}) {
  return { apikey: LEADERBOARD.key, Authorization: `Bearer ${LEADERBOARD.key}`, 'Content-Type': 'application/json', ...extra };
}
const api = path => `${LEADERBOARD.url.replace(/\/$/, '')}/rest/v1/${path}`;

async function request(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The leaderboard did not respond in time.' : 'Could not reach the leaderboard.');
  } finally { clearTimeout(t); }
}

// Only well-formed rows are ever rendered.
function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const name = typeof r.name === 'string' && /^[A-Za-z0-9 _.-]{2,20}$/.test(r.name) ? r.name : null;
  const score = int(r.score, -1000, 1000), time = int(r.time_ms, 0, 864e5);
  if (!name || score === null || time === null) return null;
  return {
    name, score, time_ms: time,
    band: typeof r.band === 'string' ? r.band.slice(0, 40) : '',
    correct: r.correct === true,
    accusations: int(r.accusations, 1, 3) || 1,
    authorities: int(r.authorities, 0, 20) || 0,
    created_at: typeof r.created_at === 'string' && !Number.isNaN(Date.parse(r.created_at)) ? r.created_at : new Date(0).toISOString(),
  };
}

function localAll() {
  const all = store.load(LOCAL);
  return Array.isArray(all) ? all.map(r => r && { ...cleanRow(r), case_id: r.case_id }).filter(r => r && r.name) : [];
}

export function localScores(caseId) {
  return localAll().filter(s => s.case_id === caseId).sort(byRank);
}

/* --- detective key ---------------------------------------------------------------
   A random code this browser keeps. The first score posted under a name claims the
   name for this key; the database refuses that name from any other key. Copy the key
   to another device (Settings) to post under the same name there. */
const OWNER = 'synapse:owner';
const KEY_RE = /^[a-f0-9]{32}$/;
export function detectiveKey() {
  let k = store.load(OWNER);
  if (!KEY_RE.test(k || '')) {
    k = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    store.save(OWNER, k);
  }
  return k;
}
export const formatKey = k => k.match(/.{4}/g).join('-');
export function setDetectiveKey(text) {
  const k = String(text || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (!KEY_RE.test(k)) return false;
  store.save(OWNER, k);
  return true;
}

// entry: { case_id, name, score, time_ms, band, correct, accusations, authorities }
export async function submitScore(entry) {
  if (!Number.isInteger(entry.score) || !Number.isInteger(entry.time_ms)) throw new Error('Invalid score.');
  const row = { ...entry, created_at: new Date().toISOString() };
  const all = localAll();
  all.push(row);
  store.save(LOCAL, all.sort(byRank).slice(0, LOCAL_MAX));
  const localRank = localScores(entry.case_id).findIndex(s => s.created_at === row.created_at && s.name === row.name) + 1;
  if (!isGlobal()) return { global: false, rank: localRank || null };
  const post = body => request(api('scores'), { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(body) });
  let res = await post({ ...entry, owner: detectiveKey() });
  let text = res.ok ? '' : await res.text().catch(() => '');
  // A database that has not had the name-ownership SQL yet has no owner column.
  if (!res.ok && /owner/i.test(text) && /column/i.test(text)) { res = await post(entry); text = res.ok ? '' : await res.text().catch(() => ''); }
  if (!res.ok) {
    if (res.status === 429 || /too many/i.test(text)) throw new Error('Too many scores posted from this network. Try again later.');
    if (/belongs to another/i.test(text)) throw new Error('That name is already taken by another detective. Choose another, or bring your detective key from the device that first posted it (Settings).');
    throw new Error(/name/i.test(text) ? 'The leaderboard rejected that name.' : `The leaderboard could not save this score (${res.status}).`);
  }
  forgetRanks();
  const mine = await myRanks(entry.name).catch(() => null);
  return { global: true, rank: mine && mine.cases[entry.case_id] ? mine.cases[entry.case_id].rank : null };
}

/* --- rankings --------------------------------------------------------------------
   The same rules as the case_ranks and overall_ranks views in tools/leaderboard.sql:
   a detective is a name (any capitals); on each case their best run counts; overall,
   their best runs on every case are added up. Equal score and time share a rank. */

export const CASE_TOP = 25;
export const OVERALL_TOP = 100;
const lname = n => String(n || '').toLowerCase();

function cleanRank(r) {
  if (!r || typeof r !== 'object') return null;
  const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  const name = typeof r.name === 'string' && /^[A-Za-z0-9 _.-]{2,20}$/.test(r.name) ? r.name : null;
  const score = int(r.score, -100000, 100000), time = Number.isFinite(r.time_ms) && r.time_ms >= 0 ? Math.round(r.time_ms) : null;
  const rank = int(r.rank, 1, 1e7), players = int(r.players, 1, 1e7);
  if (!name || score === null || time === null || !rank || !players) return null;
  return {
    name, score, time_ms: time, rank, players,
    case_id: typeof r.case_id === 'string' && /^[A-Z0-9-]{3,32}$/.test(r.case_id) ? r.case_id : undefined,
    cases: int(r.cases, 1, 1000) || undefined,
    band: typeof r.band === 'string' ? r.band.slice(0, 40) : '',
    correct: r.correct === true,
    created_at: typeof r.created_at === 'string' && !Number.isNaN(Date.parse(r.created_at)) ? r.created_at : new Date(0).toISOString(),
  };
}

function ranked(rows) {
  rows.sort((a, b) => byRank(a, b) || a.created_at.localeCompare(b.created_at));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && p.score === r.score && p.time_ms === r.time_ms ? p.rank : i + 1; r.players = rows.length; });
  return rows;
}
function localBest() {
  const best = new Map();
  for (const r of localAll()) {
    const k = `${r.case_id}|${lname(r.name)}`, b = best.get(k);
    if (!b || byRank(r, b) < 0 || (byRank(r, b) === 0 && r.created_at < b.created_at)) best.set(k, r);
  }
  return [...best.values()];
}
const localCase = caseId => ranked(localBest().filter(r => r.case_id === caseId).map(r => ({ ...r })));
function localOverall() {
  const per = new Map();
  for (const r of localBest()) {
    const k = lname(r.name), p = per.get(k) || { name: r.name, score: 0, time_ms: 0, cases: 0, created_at: r.created_at };
    p.score += r.score; p.time_ms += r.time_ms; p.cases++;
    if (r.created_at > p.created_at) { p.created_at = r.created_at; p.name = r.name; }
    per.set(k, p);
  }
  return ranked([...per.values()]);
}

// Reads send the public key in the URL and no custom headers, so the browser
// makes one plain request instead of a CORS preflight plus the request. Answers
// are kept for 30 seconds, so switching between boards does not ask again.
const CACHE_MS = 30000;
const cache = new Map();
export const forgetRanks = () => cache.clear();
function view(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p;
  const p = (async () => {
    const res = await request(`${api(path)}&apikey=${encodeURIComponent(LEADERBOARD.key)}`);
    if (!res.ok) throw new Error(`Could not load the leaderboard (${res.status}).`);
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows.map(cleanRank).filter(Boolean) : [];
  })();
  cache.set(path, { at: Date.now(), p });
  p.catch(() => cache.delete(path));
  return p;
}
const CASE_COLS = 'select=case_id,name,score,time_ms,band,correct,created_at,rank,players';
const ALL_COLS = 'select=name,score,time_ms,cases,created_at,rank,players';

// How hard each case is, from everyone's posted runs: { [caseId]: stats }.
// Empty without the shared leaderboard (one browser's runs say nothing about difficulty).
export const STATS_MIN_RUNS = 5;
export async function caseStats() {
  if (!isGlobal()) return {};
  const res = await request(`${api('case_stats?select=case_id,runs,players,avg_score,solved_pct,first_time_pct,median_ms')}&apikey=${encodeURIComponent(LEADERBOARD.key)}`);
  if (!res.ok) return {};
  const rows = await res.json().catch(() => []);
  const int = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.case_id !== 'string' || !/^[A-Z0-9-]{3,32}$/.test(r.case_id)) continue;
    const s = { runs: int(r.runs, 0, 1e9), players: int(r.players, 0, 1e9), avg: int(r.avg_score, -1000, 100000),
      solved: int(r.solved_pct, 0, 100), firstTime: int(r.first_time_pct, 0, 100), median: int(Number(r.median_ms), 0, 864e5 * 7) };
    if (s.runs !== null && s.runs >= STATS_MIN_RUNS) out[r.case_id] = s;
  }
  return out;
}

// The top of one case: { rows, players }
export async function caseBoard(caseId, limit = CASE_TOP) {
  if (!isGlobal()) { const all = localCase(caseId); return { rows: all.slice(0, limit), players: all.length }; }
  const rows = await view(`case_ranks?${CASE_COLS}&case_id=eq.${encodeURIComponent(caseId)}&order=rank.asc,created_at.asc&limit=${limit | 0}`);
  return { rows, players: rows.length ? rows[0].players : 0 };
}

// The top across every case: { rows, players }
export async function overallBoard(limit = OVERALL_TOP) {
  if (!isGlobal()) { const all = localOverall(); return { rows: all.slice(0, limit), players: all.length }; }
  const rows = await view(`overall_ranks?${ALL_COLS}&order=rank.asc,created_at.asc&limit=${limit | 0}`);
  return { rows, players: rows.length ? rows[0].players : 0 };
}

// Where one detective stands: { overall: row | null, cases: { [caseId]: row } }
// Pass the rows of an overall board already loaded to skip asking for them again.
export async function myRanks(name, { overallRows = null } = {}) {
  const me = lname(name);
  if (!/^[a-z0-9 _.-]{2,20}$/.test(me)) return { overall: null, cases: {} };
  if (!isGlobal()) {
    const cases = {};
    for (const id of new Set(localAll().map(r => r.case_id))) { const r = localCase(id).find(x => lname(x.name) === me); if (r) cases[id] = r; }
    return { overall: localOverall().find(x => lname(x.name) === me) || null, cases };
  }
  const q = encodeURIComponent(me);
  const known = overallRows && overallRows.find(r => lname(r.name) === me);
  const [rows, all] = await Promise.all([view(`case_ranks?${CASE_COLS}&lname=eq.${q}`), known ? [known] : view(`overall_ranks?${ALL_COLS}&lname=eq.${q}`)]);
  return { overall: all[0] || null, cases: Object.fromEntries(rows.filter(r => r.case_id).map(r => [r.case_id, r])) };
}
