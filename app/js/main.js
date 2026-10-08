// Hash router.
//   #/                     case catalog
//   #/play/<case>          setup, briefing, desk, reveal, score (by saved state)
//   #/print/<case>         print-and-play kit
//   #/replay/<case>        the solved file with its key clues marked
//   #/leaderboard[/<case>] leaderboard
//   #/r/<data>             a shared result

import { h, append, clear, closeAllModals } from './util.js';
import { loadCatalog, loadManifest, loadCaseDocs, loadSlips, loadSealed } from './docs.js';
import { loadState, hasSeenSolution } from './state.js';
import { renderHome, renderSetup, renderBriefing } from './home.js';
import { renderPrintKit } from './printkit.js';
import { renderLeaderboard, renderResult } from './boards.js';
import { mountGame } from './game.js';
import { mountSign, mountReveal, mountScore } from './reveal.js';
import { applySettings } from './settings.js';
import { renderReplay } from './replay.js';

const app = document.getElementById('app');
let cleanup = null;
let seq = 0;

export function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function route() {
  const my = ++seq;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  closeAllModals();
  document.querySelectorAll('.fx-overlay').forEach(el => el.remove());
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.body.dataset.view = view || 'home';
  window.scrollTo(0, 0);
  try {
    const catalog = await loadCatalog();
    if (my !== seq) return;
    document.title = 'Project Synapse';
    if (!view) { cleanup = renderHome(app, catalog, go); return; }
    if (view === 'leaderboard') { document.title = 'Leaderboard - Project Synapse'; cleanup = renderLeaderboard(app, catalog, arg, go); return; }
    if (view === 'r') { cleanup = renderResult(app, catalog, arg); return; }
    if (!catalog.cases.some(c => c.id === arg)) { location.hash = '#/'; return; }
    const m = await loadManifest(arg);
    document.title = `${m.title} - Project Synapse`;
    if (view === 'print') { cleanup = renderPrintKit(app, m); return; }
    if (view !== 'play' && view !== 'replay') { location.hash = '#/'; return; }

    app.replaceChildren(h('div', { class: 'boot' }, h('span', { class: 'brand-mark lg spin' }), 'Opening the file...'));
    await loadCaseDocs(m);
    if (my !== seq) return;
    const st = loadState(arg);
    // Spoiler files arrive only when the game has reached them.
    if (st && st.spent && st.spent.length) await loadSlips(m);
    if (view === 'replay' || (st && (st.accusations.length || !['briefing', 'playing'].includes(st.status)))) await loadSealed(m);
    if (my !== seq) return;
    if (view === 'replay') {
      // Only once the solution has been seen: replay marks every key clue.
      if (!hasSeenSolution(arg) && !(st && st.status === 'done')) { location.hash = `#/play/${arg}`; return; }
      document.title = `Replay: ${m.title} - Project Synapse`;
      cleanup = renderReplay(app, m, st, go);
      return;
    }
    const ctx = { go };
    if (!st) cleanup = renderSetup(app, m, go);
    else if (st.status === 'briefing') cleanup = renderBriefing(app, m, st, go);
    else if (st.status === 'playing') cleanup = mountGame(app, m, st, ctx);
    else if (st.status === 'signing') cleanup = mountSign(app, m, st, ctx);
    else if (st.status === 'reveal') cleanup = mountReveal(app, m, st, ctx);
    else cleanup = mountScore(app, m, st, ctx);
  } catch (err) {
    console.error(err);
    const local = location.protocol === 'file:';
    append(clear(app), h('main', { class: 'page error' },
      h('div', { class: 'kicker' }, 'Something went wrong'),
      h('h1', { class: 'display sm' }, 'The file would not open.'),
      h('p', { class: 'lead' }, local
        ? 'This app has to be served over http, not opened straight from disk. Run "node tools/serve.js" in the project folder and open the address it prints.'
        : String(err.message || err)),
      h('a', { class: 'btn', href: '#/' }, 'Back to all cases')));
  }
}

applySettings();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
