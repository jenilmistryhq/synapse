// Front of house: the case catalog, the print kit, setup and the briefing.

import { h, icon, fmtClock, confirmModal, modal, plural, append, clear, store } from './util.js';
import { pageNode } from './docs.js';
import { loadState, saveState, clearState, newState, timerNow, timerStart, remaining, hasSeenSolution } from './state.js';

const TIER_ORDER = ['Easy', 'Medium', 'Hard', 'Expert'];
const FILTER_KEY = 'synapse:filters';

function statusOf(id) {
  const st = loadState(id);
  if (!st) return { key: 'new', st };
  if (st.status === 'done') return { key: 'solved', st };
  return { key: 'progress', st };
}

/* --- home: the catalog --------------------------------------------------------- */
export function renderHome(app, catalog, go) {
  const cases = catalog.cases;
  const f = { q: '', tier: 'All', status: 'All', ...(store.load(FILTER_KEY) || {}), q: '' };
  const tierCount = t => cases.filter(c => c.tier === t).length;
  const solved = cases.filter(c => statusOf(c.id).key === 'solved').length;

  const grid = h('div', { class: 'cases' });
  const countEl = h('span', { class: 'muted' });
  const chipRow = (label, key, items) => h('div', { class: 'chip-row', role: 'group', 'aria-label': label }, h('span', { class: 'chip-label' }, label),
    items.map(([v, text, n]) => h('button', {
      class: `fchip ${f[key] === v ? 'on' : ''}`, 'aria-pressed': f[key] === v ? 'true' : 'false',
      onclick: e => {
        f[key] = v; store.save(FILTER_KEY, { tier: f.tier, status: f.status });
        const btn = e.currentTarget;
        [...btn.parentNode.querySelectorAll('.fchip')].forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        draw();
      },
    }, text, n != null ? h('span', { class: 'fchip-n' }, n) : null)));

  function filtered() {
    const q = f.q.trim().toLowerCase();
    return cases.filter(c => {
      if (f.tier !== 'All' && c.tier !== f.tier) return false;
      const s = statusOf(c.id).key;
      if (f.status === 'New' && s !== 'new') return false;
      if (f.status === 'In progress' && s !== 'progress') return false;
      if (f.status === 'Solved' && s !== 'solved') return false;
      if (q && !`${c.number} ${c.title} ${c.tagline} ${c.tier}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function draw() {
    const list = filtered();
    countEl.textContent = list.length === cases.length ? plural(cases.length, 'case') : `${list.length} of ${cases.length} cases`;
    grid.replaceChildren(...(list.length ? list.map(c => caseCard(c, resetCase)) : [h('div', { class: 'empty' },
      h('p', {}, f.tier !== 'All' && !tierCount(f.tier) ? `No ${f.tier} cases yet. More are on the way.` : 'No cases match those filters.'),
      h('button', { class: 'btn ghost sm', onclick: () => { f.q = ''; f.tier = 'All'; f.status = 'All'; store.save(FILTER_KEY, {}); renderHome(app, catalog, go); } }, 'Clear filters'))]));
  }

  async function resetCase(c) {
    const ok = await confirmModal({
      kicker: `Case ${c.number}`, title: `Reset ${c.title}?`,
      body: h('p', {}, 'This deletes your saved investigation for this case on this device: notes, sheet, spent Authorities and the clock. Scores already posted to the leaderboard stay.'),
      confirm: 'Reset case', danger: true,
    });
    if (ok) { clearState(c.id); renderHome(app, catalog, go); }
  }

  async function resetAll() {
    const inv = h('input', { type: 'checkbox', checked: true });
    const scores = h('input', { type: 'checkbox' });
    const name = h('input', { type: 'checkbox' });
    const ok = await confirmModal({
      kicker: 'Settings', title: 'Reset all progress?',
      body: [
        h('p', {}, 'Choose what to delete from this browser. This cannot be undone.'),
        h('label', { class: 'check-line' }, inv, h('span', {}, h('b', {}, 'Saved investigations'), ' for every case')),
        h('label', { class: 'check-line' }, scores, h('span', {}, h('b', {}, 'Leaderboard scores'), ' posted from this device (the shared leaderboard is not affected)')),
        h('label', { class: 'check-line' }, name, h('span', {}, h('b', {}, 'Remembered name'), ' and filters')),
        h('p', { class: 'hint' }, 'Cases whose solution you have already seen still cannot be posted to the leaderboard again.'),
      ],
      confirm: 'Delete', danger: true,
    });
    if (!ok) return;
    if (inv.checked) cases.forEach(c => clearState(c.id));
    if (scores.checked) store.remove('synapse:scores');
    if (name.checked) { store.remove('synapse:name'); store.remove(FILTER_KEY); store.remove('synapse:board'); }
    renderHome(app, catalog, go);
  }

  function random() {
    const pool = filtered();
    if (!pool.length) return;
    const fresh = pool.filter(c => statusOf(c.id).key !== 'solved');
    const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    const s = statusOf(pick.id);
    const dlg = modal({
      kicker: `Random case · Case ${pick.number} · ${pick.tier} · ${pick.time}`,
      title: pick.title,
      body: [h('p', { class: 'lead' }, pick.tagline), h('p', {}, pick.hook),
        s.key !== 'new' ? h('div', { class: 'callout' }, s.key === 'solved' ? 'You have solved this one already.' : 'You have this case in progress.') : null],
      actions: [
        { label: 'Roll again', kind: 'ghost', onClick: () => { setTimeout(random, 220); } },
        { label: s.key === 'progress' ? 'Continue this case' : 'Open this case', kind: 'primary', onClick: () => go(`#/play/${pick.id}`) },
      ],
    });
    return dlg;
  }

  const search = h('input', { class: 'field search', type: 'search', placeholder: 'Search cases', 'aria-label': 'Search cases',
    oninput: e => { f.q = e.target.value; draw(); } });

  append(clear(app), h('div', { class: 'home' },
    h('nav', { class: 'topnav' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-word' }, 'Synapse')),
      h('a', { class: 'btn ghost sm', href: '#/leaderboard' }, icon('trophy'), 'Leaderboard')),
    h('header', { class: 'hero' },
      h('h1', { class: 'display' }, 'The documents don\'t lie.', h('br'), h('span', { class: 'accent' }, 'People might.')),
      h('p', { class: 'lead' }, 'Solo deductive murder mysteries built from case files: autopsies, interviews, access logs, and a budget of favours you cannot get back. Read the file. Prove who did it. Beat the clock.')),
    h('section', { class: 'catalog' },
      h('div', { class: 'catalog-head' },
        h('div', {}, h('h2', { class: 'section-h' }, 'Case files'), h('div', { class: 'catalog-stats' }, countEl, solved ? h('span', { class: 'solved-count' }, icon('check'), `${solved} solved`) : null)),
        h('button', { class: 'btn primary', onclick: random }, icon('dice'), 'Random case')),
      h('div', { class: 'toolbar' },
        search,
        chipRow('Difficulty', 'tier', [['All', 'All'], ...TIER_ORDER.map(t => [t, t])]),
        chipRow('Status', 'status', [['All', 'All'], ['New', 'New'], ['In progress', 'In progress'], ['Solved', 'Solved']])),
      grid),
    h('section', { class: 'how' },
      how('file', 'Read the file', 'Every document is real paperwork. Compare two side by side, highlight what matters, keep a notebook.'),
      how('envelope', 'Spend wisely', 'A fixed number of Authorities. Each opens one sealed line of inquiry. Not all of them help.'),
      how('trophy', 'Prove it, fast', 'Write your working with citations. Score the file, then post your time to the leaderboard.')),
    h('footer', { class: 'foot' },
      h('p', {}, 'Prefer paper? Every case also comes as a print-and-play kit for a table of up to six.'),
      h('p', { class: 'muted' }, 'Progress is saved in this browser. ', h('button', { class: 'linkbtn', onclick: resetAll }, 'Reset all progress')))));
  draw();
  return () => {};
}

const how = (ic, t, d) => h('div', { class: 'how-item' }, icon(ic), h('h3', {}, t), h('p', {}, d));

function caseCard(c, onReset) {
  const { key, st } = statusOf(c.id);
  const badge = key === 'solved' ? h('span', { class: 'status solved' }, icon('check'), st.score ? `${st.score.total} pts` : 'Solved')
    : key === 'progress' ? h('span', { class: 'status progress' }, st.status === 'playing' ? fmtClock(timerNow(st)) : 'In progress')
      : h('span', { class: 'status new' }, 'New');
  const detail = key === 'progress' && st.status === 'playing' ? `${plural(remaining(st), 'Authority', 'Authorities')} left`
    : key === 'solved' && st.score ? st.score.band.title : c.time;
  return h('article', { class: `case-card is-${key}` },
    h('div', { class: 'cc-top' }, h('span', { class: 'cc-no' }, c.number), h('span', { class: `tier t-${c.tier.toLowerCase()}` }, c.tier), badge),
    h('h3', { class: 'cc-title' }, h('a', { href: `#/play/${c.id}` }, c.title)),
    h('p', { class: 'tagline' }, c.tagline),
    h('div', { class: 'cc-foot' },
      h('span', { class: 'cc-meta' }, icon('clock'), detail),
      st ? h('button', { class: 'cc-print', title: 'Reset this case', 'aria-label': `Reset ${c.title}`, onclick: () => onReset(c) }, icon('reset')) : null,
      h('a', { class: 'cc-print', href: `#/print/${c.id}`, title: 'Print & play kit', 'aria-label': `Print ${c.title}` }, icon('print')),
      h('a', { class: 'btn sm primary', href: `#/play/${c.id}` }, key === 'progress' ? 'Continue' : key === 'solved' ? 'Result' : 'Play')),
    c.note ? h('p', { class: 'note' }, c.note) : null);
}

/* --- setup (solo) ---------------------------------------------------------------- */
export function renderSetup(app, m, go) {
  let phased = true;
  const replay = hasSeenSolution(m.id);
  const start = () => { saveState(newState(m, { phased })); go(`#/play/${m.id}`); };
  append(clear(app), h('div', { class: 'page setup' },
    h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
    h('div', { class: 'kicker' }, `Case ${m.number} · ${m.tier} · ${m.time}`),
    h('h1', { class: 'display sm' }, m.title),
    h('p', { class: 'lead' }, m.hook),
    m.phases ? h('label', { class: 'card toggle' },
      h('input', { type: 'checkbox', checked: true, onchange: e => { phased = e.target.checked; } }),
      h('span', {}, h('b', {}, 'Phased release (recommended)'),
        h('span', { class: 'muted' }, `The file opens in ${m.phases.length} stages, and you write a hypothesis to unlock each one. Handing yourself everything at once removes the only pacing this game has.`))) : null,
    h('div', { class: 'card facts-card' }, h('ul', { class: 'rules' },
      h('li', {}, `${m.budget['1']} Authorities: sealed lines of inquiry you can open. They do not come back.`),
      h('li', {}, 'Two wrong accusations allowed. The third is final.'),
      h('li', {}, 'The clock runs while you play. Pause it any time.'))),
    replay ? h('div', { class: 'callout' }, 'You have seen this case\'s solution before, so this run will not be posted to the leaderboard. You can still play and score it.') : null,
    h('button', { class: 'btn primary lg', onclick: start }, 'Open the file', icon('arrow'))));
  return () => {};
}

/* --- briefing --------------------------------------------------------------------- */
export function renderBriefing(app, m, st, go) {
  const brief = m.documents.find(d => d.id === 'BRIEF');
  const begin = () => {
    st.status = 'playing';
    const first = st.setup.phased ? m.phases[0].docs.find(d => d !== 'BRIEF' && d !== 'RULES') : m.documents.find(d => d.kind === 'base').id;
    st.ui.panes = [first];
    timerStart(st);
    saveState(st);
    go(`#/play/${m.id}`);
  };
  const restart = async () => {
    const ok = await confirmModal({ title: 'Back to setup?', body: h('p', {}, 'This discards the investigation you just opened.'), confirm: 'Back to setup' });
    if (ok) { clearState(m.id); go(`#/play/${m.id}`); }
  };
  append(clear(app), h('div', { class: 'page briefing' },
    h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
    h('div', { class: 'kicker' }, `Case ${m.number} · ${m.title}`),
    h('h1', { class: 'display sm' }, 'Read the briefing'),
    h('div', { class: 'paper' }, brief.pages.map(p => pageNode(m, brief.src, p))),
    h('div', { class: 'brief-go' },
      h('button', { class: 'linkbtn', onclick: restart }, 'Change setup'),
      h('div', { class: 'brief-cta' },
        h('span', { class: 'muted' }, 'The clock starts when you begin.'),
        h('button', { class: 'btn primary lg', onclick: begin }, 'Begin the review', icon('arrow'))))));
  return () => {};
}
