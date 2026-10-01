// The leaderboard page and the public page a shared result link opens.

import { h, icon, fmtClock, append, clear, store, plural } from './util.js';
import { caseBoard, overallBoard, myRanks, isGlobal, CASE_TOP, OVERALL_TOP } from './leaderboard.js';
import { decodeResult } from './share.js';

const NAME_KEY = 'synapse:name';
const LAST_BOARD = 'synapse:board';

export function renderLeaderboard(app, catalog, which, go) {
  const cases = catalog.cases;
  const pick = which || store.load(LAST_BOARD) || 'overall';
  const current = pick === 'overall' ? null : cases.find(c => c.id === pick) || null;
  store.save(LAST_BOARD, current ? current.id : 'overall');
  const meName = store.load(NAME_KEY) || '';
  const me = meName.toLowerCase();
  const loading = () => h('div', { class: 'boot inline' }, h('span', { class: 'brand-mark spin' }), 'Loading scores...');
  const body = h('div', { class: 'board-body' }, loading());
  const mine = h('div', { class: 'card board-me' }, loading());

  const picker = h('select', { class: 'field board-pick', 'aria-label': 'Choose a leaderboard', onchange: e => go(`#/leaderboard/${e.target.value}`) },
    h('option', { value: 'overall' }, `Overall · every case (top ${OVERALL_TOP})`),
    cases.map(c => h('option', { value: c.id }, `Case ${c.number} · ${c.title}`)));
  picker.value = current ? current.id : 'overall';

  append(clear(app), h('main', { class: 'page wide' },
    h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
    h('div', { class: 'kicker' }, isGlobal() ? 'Global leaderboard' : 'Leaderboard · this device'),
    h('h1', { class: 'display sm' }, current ? 'Best reviews' : 'Top detectives'),
    h('p', { class: 'lead' }, current
      ? `The top ${CASE_TOP} on this case. Each detective's best run counts, ranked by score, then by time on the clock.`
      : `The top ${OVERALL_TOP} across every case. Each detective's best score on each case is added up; ties go to the shorter total time.`),
    h('div', { class: 'board-top' }, picker, current ? h('a', { class: 'btn primary', href: `#/play/${current.id}` }, 'Play this case', icon('arrow')) : null),
    !isGlobal() ? h('div', { class: 'callout' }, "These are the scores posted from this browser. When the site owner connects the shared leaderboard, everyone's scores appear here.") : null,
    mine, body));

  const row = (r, extra = '') => h('tr', { class: `${r.rank <= 3 ? `top top${r.rank}` : ''} ${r.name.toLowerCase() === me ? 'me' : ''} ${extra}` },
    h('td', { class: 'n rank' }, r.rank <= 3 ? h('span', { class: 'medal' }, r.rank) : r.rank),
    h('td', { class: 'who' }, r.name, current && !r.correct ? h('span', { class: 'tag' }, 'Wrong finding') : null),
    h('td', { class: 'n mono strong' }, r.score),
    current ? h('td', { class: 'hide-sm muted' }, r.band) : h('td', { class: 'n hide-sm muted' }, plural(r.cases || 1, 'case')),
    h('td', { class: 'n mono' }, fmtClock(r.time_ms)),
    h('td', { class: 'n hide-sm muted' }, new Date(r.created_at).toLocaleDateString()));

  function drawTable(board, meRow) {
    if (!board.rows.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('p', {}, current ? 'No scores yet for this case.' : 'No scores yet.'),
        h('a', { class: 'btn sm', href: current ? `#/play/${current.id}` : '#/' }, current ? 'Be the first' : 'Pick a case')));
      return;
    }
    const inTop = meRow && board.rows.some(r => r.name.toLowerCase() === me);
    body.replaceChildren(
      h('p', { class: 'board-count muted' }, `${plural(board.players, 'detective')} ranked${board.players > board.rows.length ? `, showing the top ${board.rows.length}` : ''}.`),
      h('table', { class: 'board' },
        h('thead', {}, h('tr', {}, h('th', { class: 'n' }, '#'), h('th', {}, 'Detective'), h('th', { class: 'n' }, 'Score'),
          current ? h('th', { class: 'hide-sm' }, 'Finding') : h('th', { class: 'n hide-sm' }, 'Cases'),
          h('th', { class: 'n' }, current ? 'Time' : 'Total time'), h('th', { class: 'n hide-sm' }, current ? 'Date' : 'Last played'))),
        h('tbody', {}, board.rows.map(r => row(r)),
          meRow && !inTop ? [h('tr', { class: 'gap', 'aria-hidden': 'true' }, h('td', { colspan: 6 }, '...')), row(meRow, 'pinned')] : null)));
  }

  function drawMine(ranks) {
    if (!meName) {
      mine.replaceChildren(h('div', { class: 'card-h' }, icon('trophy'), 'Where you stand'),
        h('p', { class: 'muted' }, 'Post a score after you solve a case and your rankings show up here.'));
      return;
    }
    const caseRows = cases.filter(c => ranks.cases[c.id]).map(c => ({ c, r: ranks.cases[c.id] }));
    const o = ranks.overall;
    mine.replaceChildren(
      h('div', { class: 'card-h' }, icon('trophy'), 'Where you stand', h('span', { class: 'muted' }, `as ${meName}`)),
      h('div', { class: 'me-grid' },
        h('a', { class: `me-cell ${!current ? 'on' : ''}`, href: '#/leaderboard/overall' },
          h('span', { class: 'me-k' }, 'Overall'),
          o ? [h('b', {}, `#${o.rank}`), h('span', { class: 'me-s' }, `of ${o.players} · ${o.score} pts`)] : h('span', { class: 'me-s' }, 'Not ranked yet')),
        caseRows.map(({ c, r }) => h('a', { class: `me-cell ${current && current.id === c.id ? 'on' : ''}`, href: `#/leaderboard/${c.id}` },
          h('span', { class: 'me-k' }, `Case ${c.number}`),
          h('b', {}, `#${r.rank}`), h('span', { class: 'me-s' }, `of ${r.players} · ${r.score} pts`)))),
      ...(caseRows.length ? [] : [h('p', { class: 'muted small' }, 'You have not posted a score yet.')]));
  }

  const boardP = current ? caseBoard(current.id) : overallBoard();
  const mineP = meName ? myRanks(meName) : Promise.resolve({ overall: null, cases: {} });
  Promise.all([boardP, mineP]).then(([board, ranks]) => {
    drawMine(ranks);
    drawTable(board, current ? ranks.cases[current.id] : ranks.overall);
  }).catch(err => {
    mine.replaceChildren();
    body.replaceChildren(h('div', { class: 'callout warn' }, String(err.message || err)));
  });
  return () => {};
}

export function renderResult(app, catalog, data) {
  const r = decodeResult(data || '');
  const meta = r && catalog.cases.find(c => c.id === r.caseId);
  if (!r || !meta) {
    append(clear(app), h('main', { class: 'page' },
      h('h1', { class: 'display sm' }, 'That result link is broken.'),
      h('a', { class: 'btn', href: '#/' }, 'See all cases')));
    return () => {};
  }
  append(clear(app), h('main', { class: 'page result-page' },
    h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
    h('div', { class: 'result-card' },
      h('div', { class: 'kicker' }, `Project Synapse · Case ${meta.number} · ${meta.tier}`),
      h('h1', { class: 'display sm' }, meta.title),
      h('p', { class: 'lead' }, `${r.correct ? 'Solved' : 'Reviewed'} by `, h('b', {}, r.name)),
      h('div', { class: 'score-hero' },
        h('div', {}, h('div', { class: 'score-total' }, r.score), h('div', { class: 'score-l' }, 'points')),
        h('div', { class: 'band' }, h('div', { class: 'band-stamp' }, r.band),
          h('p', {}, `${fmtClock(r.time)} on the clock · ${r.accusations} accusation${r.accusations > 1 ? 's' : ''}`)))),
    h('p', { class: 'hint' }, 'A shared result is self-reported and not verified. Posted scores are on the leaderboard.'),
    h('p', { class: 'lead' }, meta.tagline, ' Think you can beat it?'),
    h('div', { class: 'score-actions' },
      h('a', { class: 'btn primary lg', href: `#/play/${meta.id}` }, 'Play this case', icon('arrow')),
      h('a', { class: 'btn ghost', href: `#/leaderboard/${meta.id}` }, icon('trophy'), 'Leaderboard'))));
  return () => {};
}
