// Shareable results. A result travels inside the link itself (#/r/<data>),
// so sharing works on a static site with no server. It never names a culprit.

import { fmtClock } from './util.js';

const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeResult(r) {
  return b64url(JSON.stringify({ v: 1, c: r.caseId, n: r.name, t: Math.round(r.time), s: r.score, b: r.band, k: r.correct ? 1 : 0, a: r.accusations }));
}

export function decodeResult(data) {
  try {
    const o = JSON.parse(unb64url(data));
    if (o.v !== 1 || typeof o.c !== 'string') return null;
    return {
      caseId: o.c, name: String(o.n || 'A detective').slice(0, 20), time: +o.t || 0, score: +o.s || 0,
      band: String(o.b || '').slice(0, 40), correct: !!o.k, accusations: +o.a || 1,
    };
  } catch { return null; }
}

export const siteUrl = () => `${location.origin}${location.pathname}`;
export const resultUrl = r => `${siteUrl()}#/r/${encodeResult(r)}`;

export function shareText(r, title) {
  return `${r.name} ${r.correct ? 'cracked' : 'closed the file on'} "${title}" in ${fmtClock(r.time)}: ${r.score} points, ${r.band.toUpperCase()}. Can you do better?`;
}

/* --- image card ------------------------------------------------------------ */
export async function renderCard(r, meta) {
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  try {
    await Promise.all([
      document.fonts.load('700 80px "IBM Plex Sans Condensed"'),
      document.fonts.load('600 24px "IBM Plex Sans Condensed"'),
      document.fonts.load('500 28px "IBM Plex Mono"'),
    ]);
  } catch { /* fall back to system fonts */ }
  const COND = '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  const MONO = '"IBM Plex Mono", Consolas, monospace';

  const bg = g.createRadialGradient(240, -60, 50, 240, -60, 900);
  bg.addColorStop(0, '#2c251a'); bg.addColorStop(1, '#110f0c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d84a33'; g.fillRect(0, 0, W, 8);

  // brand
  g.strokeStyle = '#efe9dc'; g.lineWidth = 4;
  g.beginPath(); g.arc(92, 88, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d84a33'; g.beginPath(); g.arc(92, 88, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8f8676'; g.font = `600 24px ${COND}`;
  spaced(g, 'PROJECT SYNAPSE', 132, 97, 4);

  // case
  g.fillStyle = '#d84a33'; g.font = `600 26px ${COND}`;
  spaced(g, `CASE ${meta.number} · ${meta.tier.toUpperCase()}`, 70, 190, 3);
  g.fillStyle = '#efe9dc'; g.font = `700 64px ${COND}`;
  const lines = wrap(g, meta.title.toUpperCase(), 1060);
  lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, 70, 262 + i * 66));
  const y0 = 262 + (Math.min(lines.length, 2) - 1) * 66;

  g.fillStyle = '#c3baa9'; g.font = `500 30px ${COND}`;
  g.fillText(`${r.correct ? 'Solved' : 'Reviewed'} by ${r.name}`, 72, y0 + 58);

  // score
  g.fillStyle = '#efe9dc'; g.font = `700 150px ${COND}`;
  g.fillText(String(r.score), 64, 560);
  const sw = g.measureText(String(r.score)).width;
  g.fillStyle = '#8f8676'; g.font = `600 22px ${COND}`;
  spaced(g, 'POINTS', 72 + sw, 555, 4);

  // band stamp
  g.save();
  g.translate(840, 470); g.rotate(-0.04);
  g.font = `700 44px ${COND}`;
  const label = r.band.toUpperCase();
  const bw = Math.min(520, g.measureText(label).width + 50);
  g.strokeStyle = '#d84a33'; g.lineWidth = 5; g.strokeRect(-bw / 2, -40, bw, 80);
  g.fillStyle = '#d84a33'; g.textAlign = 'center'; g.fillText(label, 0, 16, bw - 30);
  g.restore();

  g.fillStyle = '#c3baa9'; g.font = `500 28px ${MONO}`; g.textAlign = 'left';
  g.fillText(`${fmtClock(r.time)} on the clock`, 640, 574);
  g.fillStyle = '#6e665a'; g.font = `500 20px ${MONO}`; g.textAlign = 'right';
  g.fillText(siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''), W - 60, H - 30);
  return c;
}

function spaced(g, text, x, y, gap) {
  for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + gap; }
}

function wrap(g, text, max) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export const cardBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));

// Native share sheet where available (phones), with the image when allowed.
export async function nativeShare(r, meta) {
  const url = resultUrl(r), text = shareText(r, meta.title);
  if (!navigator.share) return false;
  try {
    const blob = await cardBlob(await renderCard(r, meta));
    const file = new File([blob], `synapse-case-${meta.number}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text, url, title: 'Project Synapse' });
    else await navigator.share({ text, url, title: 'Project Synapse' });
    return true;
  } catch (e) { return e && e.name === 'AbortError'; }
}

export async function downloadCard(r, meta) {
  const blob = await cardBlob(await renderCard(r, meta));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `synapse-case-${meta.number}-${r.score}.png`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
