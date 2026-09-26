// The leaderboard page and the public page a shared result link opens.

import { h, icon, fmtClock, append, clear, store } from './util.js';
import { topScores, isGlobal } from './leaderboard.js';
import { decodeResult } from './share.js';

const NAME_KEY = 'synapse:name';
const LAST_BOARD = 'synapse:board';

export function renderLeaderboard(app, catalog, caseId, go) {
  const cases = catalog.cases;
  const current = cases.find(c => c.id === caseId) || cases.find(c => c.id === store.load(LAST_BOARD)) || cases[0];
  store.save(LAST_BOARD, current.id);
  const me = (store.load(NAME_KEY) || '').toLowerCase();
  const body = h('div', { class: 'board-body' }, h('div', { class: 'boot inline' }, h('span', { class: 'brand-mark spin' }), 'Loading scores...'));

  const picker = h('select', { class: 'field board-pick', 'aria-label': 'Choose a case', onchange: e => go(`#/leaderboard/${e.target.value}`) },
    cases.map(c => h('option', { value: c.id }, `Case ${c.number} · ${c.title}`)));
  picker.value = current.id;

  append(clear(app), h('div', { class: 'page wide' },
    h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
    h('div', { class: 'kicker' }, isGlobal() ? 'Global leaderboard' : 'Leaderboard · this device'),
    h('h1', { class: 'display sm' }, 'Best reviews'),
    h('p', { class: 'lead' }, 'Ranked by score, then by time on the clock. Only a first attempt at a case can be posted.'),
    h('div', { class: 'board-top' }, picker, h('a', { class: 'btn primary', href: `#/play/${current.id}` }, 'Play this case', icon('arrow'))),
    !isGlobal() ? h('div', { class: 'callout' }, 'These are the scores posted from this browser. When the site owner connects the shared leaderboard, everyone\'s scores appear here.') : null,
    body));

  topScores(current.id).then(rows => {
    if (!rows.length) {
      body.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'No scores yet for this case.'), h('a', { class: 'btn sm', href: `#/play/${current.id}` }, 'Be the first')));
      return;
    }
    body.replaceChildren(h('table', { class: 'board' },
      h('thead', {}, h('tr', {}, h('th', { class: 'n' }, '#'), h('th', {}, 'Detective'), h('th', { class: 'n' }, 'Score'), h('th', { class: 'hide-sm' }, 'Finding'), h('th', { class: 'n' }, 'Time'), h('th', { class: 'n hide-sm' }, 'Date'))),
      h('tbody', {}, rows.map((r, i) => h('tr', { class: `${i < 3 ? `top top${i + 1}` : ''} ${r.name.toLowerCase() === me ? 'me' : ''}` },
        h('td', { class: 'n rank' }, i < 3 ? h('span', { class: 'medal' }, i + 1) : i + 1),
        h('td', { class: 'who' }, r.name, !r.correct ? h('span', { class: 'tag' }, 'Wrong finding') : null),
        h('td', { class: 'n mono strong' }, r.score),
        h('td', { class: 'hide-sm muted' }, r.band),
        h('td', { class: 'n mono' }, fmtClock(r.time_ms)),
        h('td', { class: 'n hide-sm muted' }, new Date(r.created_at).toLocaleDateString()))))));
  }).catch(err => {
    body.replaceChildren(h('div', { class: 'callout warn' }, String(err.message || err)));
  });
  return () => {};
}

export function renderResult(app, catalog, data) {
  const r = decodeResult(data || '');
  const meta = r && catalog.cases.find(c => c.id === r.caseId);
  if (!r || !meta) {
    append(clear(app), h('div', { class: 'page' },
      h('h1', { class: 'display sm' }, 'That result link is broken.'),
      h('a', { class: 'btn', href: '#/' }, 'See all cases')));
    return () => {};
  }
  append(clear(app), h('div', { class: 'page result-page' },
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
