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

// entry: { case_id, name, score, time_ms, band, correct, accusations, authorities }
export async function submitScore(entry) {
  if (!Number.isInteger(entry.score) || !Number.isInteger(entry.time_ms)) throw new Error('Invalid score.');
  const row = { ...entry, created_at: new Date().toISOString() };
  const all = localAll();
  all.push(row);
  store.save(LOCAL, all.sort(byRank).slice(0, LOCAL_MAX));
  const localRank = localScores(entry.case_id).findIndex(s => s.created_at === row.created_at && s.name === row.name) + 1;
  if (!isGlobal()) return { global: false, rank: localRank || null };
  const res = await request(api('scores'), { method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(entry) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429 || /too many/i.test(text)) throw new Error('Too many scores posted from this network. Try again later.');
    throw new Error(/name/i.test(text) ? 'The leaderboard rejected that name.' : `The leaderboard could not save this score (${res.status}).`);
  }
  return { global: true, rank: await globalRank(entry).catch(() => null) };
}

async function globalRank(e) {
  const filter = `case_id=eq.${encodeURIComponent(e.case_id)}&or=(score.gt.${e.score},and(score.eq.${e.score},time_ms.lt.${e.time_ms}))`;
  const res = await request(api(`scores?select=id&${filter}`), { method: 'HEAD', headers: headers({ Prefer: 'count=exact' }) });
  const n = parseInt((res.headers.get('content-range') || '').split('/')[1], 10);
  return Number.isFinite(n) ? n + 1 : null;
}

export async function topScores(caseId, limit = 50) {
  if (!isGlobal()) return localScores(caseId).slice(0, limit);
  const q = `scores?select=name,score,time_ms,band,correct,accusations,authorities,created_at&case_id=eq.${encodeURIComponent(caseId)}&order=score.desc,time_ms.asc&limit=${Math.min(100, limit | 0)}`;
  const res = await request(api(q), { headers: headers() });
  if (!res.ok) throw new Error(`Could not load the leaderboard (${res.status}).`);
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.map(cleanRow).filter(Boolean) : [];
}
