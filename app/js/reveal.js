// Endgame: sign the sheet, break Envelope S-1 step by step, score the file.

import { h, icon, fmtClock, toast, modal, confirmModal, plural, append, clear, store } from './util.js';
import { chunkNodes, pageNode } from './docs.js';
import { saveState, clearState, wrongCount, markSolutionSeen, hintsTaken } from './state.js';
import { submitScore, MIN_TIME } from './leaderboard.js';
import { checkName, cleanName } from './profanity.js';
import { nativeShare, downloadCard, resultUrl, shareText } from './share.js';

const NAME_KEY = 'synapse:name';
import { openEnvelope } from './fx.js';
import { motionReduced } from './settings.js';
import { portrait } from './people.js';

const optionOf = (m, id) => m.accusation.options.find(o => o.id === id);

/* --- sign ------------------------------------------------------------------ */
export function mountSign(root, m, st, { go }) {
  const opt = optionOf(m, st.final.option);
  const wrongFinal = !!opt.reconsider;
  const line = wrongFinal
    ? 'That was your third accusation. It is final, and it will be scored as it stands.'
    : 'There is no Reconsider envelope for this finding. Nothing is left to open but Envelope S-1.';
  const name = h('input', { class: 'field', placeholder: 'Your name, or the team\'s', value: st.final.signedBy || '', 'aria-label': 'Lead reviewer' });
  const done = st.sheet.steps.filter(s => s.text.trim() && s.cites.length).length;

  const breakSeal = async () => {
    st.final.signedBy = name.value.trim() || 'The review team';
    saveState(st);
    await openEnvelope({ kicker: 'Envelope S-1', label: 'Case Resolution & Final Summary', sub: 'Read aloud, in order, without skipping ahead', tone: 'red' });
    st.status = 'reveal';
    st.reveal.i = 0;
    saveState(st);
    go(`#/play/${m.id}`);
  };

  root.replaceChildren(h('main', { class: 'scene sign' }, h('div', { class: 'stage-inner narrow' },
    h('div', { class: 'kicker' }, `Case ${m.number} · ${m.title}`),
    h('h1', { class: 'display' }, 'The review is closed.'),
    h('p', { class: 'lead' }, line),
    h('div', { class: 'card finding' },
      h('div', { class: 'kicker' }, `Your finding · accusation ${st.final.n} of 3 · at ${fmtClock(st.final.at)}`),
      h('div', { class: 'finding-text' }, opt.label)),
    h('div', { class: 'card' },
      h('div', { class: 'card-h' }, icon('sheet'), `Resolution Sheet · ${done} of ${st.sheet.steps.length} steps written and cited`),
      h('ol', { class: 'sheet-mini' }, m._steps.map((q, i) => {
        const s = st.sheet.steps[i];
        const ok = s.text.trim() && s.cites.length;
        return h('li', { class: ok ? 'ok' : '' }, icon(ok ? 'check' : 'close'), h('span', {}, q));
      })),
      h('p', { class: 'hint' }, 'The sheet is now locked. It is scored exactly as written.')),
    h('label', { class: 'lbl sign-lbl' }, 'Signed, lead reviewer', name),
    h('button', { class: 'btn primary lg block', onclick: breakSeal }, icon('seal'), 'Break the seal on Envelope S-1'),
    h('p', { class: 'hint center' }, 'One person reads aloud. Pause after each step and check your own sheet against it. Score afterwards, not during.'))));
  return () => {};
}

/* --- reveal ------------------------------------------------------------------ */
export function mountReveal(root, m, st, { go }) {
  markSolutionSeen(m.id);
  const steps = m.reveal.steps;
  const chunks = m._chunks;
  const count = steps.length + 1;
  const stage = h('main', { class: 'scene reveal' });
  root.replaceChildren(stage);

  const save = () => saveState(st);

  function render() {
    const i = Math.max(0, Math.min(count - 1, st.reveal.i));
    const last = i === count - 1;
    const dots = h('ol', { class: 'rv-dots', 'aria-label': 'Progress' }, Array.from({ length: count }, (_, k) => {
      const lab = k === 0 ? 'S-1' : steps[k - 1].sheet === 'verdict' ? 'Verdict' : steps[k - 1].sheet === 'epilogue' ? 'Coda' : String(k);
      return h('li', { class: k < i ? 'done' : k === i ? 'now' : '' },
        h('button', { onclick: () => { if (k <= furthest()) { st.reveal.i = k; save(); render(); } }, disabled: k > furthest(), 'aria-label': `Go to ${lab}` }, lab));
    }));
    const body = i === 0 ? coverView() : chunkView(i - 1);
    stage.replaceChildren(
      h('header', { class: 'rv-top' },
        h('div', { class: 'kicker' }, `Envelope S-1 · Case ${m.number} · ${m.title}`),
        dots),
      body,
      h('footer', { class: 'rv-nav' },
        h('button', { class: 'btn ghost', disabled: i === 0, onclick: () => move(-1) }, icon('left'), 'Back'),
        h('span', { class: 'rv-count' }, i === 0 ? 'Read aloud, in order' : `${i} of ${count - 1}`),
        last
          ? h('button', { class: 'btn primary', onclick: finish }, 'Score the file', icon('arrow'))
          : h('button', { class: 'btn primary', onclick: () => move(1) }, i === 0 ? 'Begin' : 'Next', icon('right'))));
    stage.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  const furthest = () => Math.max(st.reveal.max || 0, st.reveal.i);
  function move(d) {
    st.reveal.i = Math.max(0, Math.min(count - 1, st.reveal.i + d));
    st.reveal.max = Math.max(st.reveal.max || 0, st.reveal.i);
    save(); render();
  }

  function coverView() {
    return h('div', { class: 'rv-cover' }, h('div', { class: 'paper' }, pageNode(m, m.reveal.src, m.reveal.cover)));
  }

  function chunkView(k) {
    const step = steps[k];
    const chunk = chunks[k] || { kind: 'step', nodes: [] };
    const paper = h('div', { class: 'paper' }, h('div', { class: `doc rv-doc ${chunk.kind === 'verdict' ? 'verdict' : ''}` }, chunkNodes(chunk)));
    return h('div', { class: `rv-grid ${step.sheet === 'epilogue' ? 'epilogue' : ''}` }, paper, sideCard(step));
  }

  function sheetAnswer(step) {
    const [kind, idx] = step.sheet.split(':');
    if (kind === 'step') {
      const s = st.sheet.steps[+idx];
      return [
        h('div', { class: 'kicker' }, `Your sheet · Step ${+idx + 1}`),
        h('div', { class: 'rv-q' }, m._steps[+idx]),
        s.text.trim() ? h('blockquote', { class: 'rv-ans' }, s.text) : h('p', { class: 'muted' }, 'Nothing written.'),
        cites(s.cites),
      ];
    }
    if (kind === 'persons') {
      return [
        h('div', { class: 'kicker' }, `Your sheet · ${m.persons.label}`),
        h('div', { class: 'rv-persons' }, m.persons.list.map(p => {
          const r = st.sheet.persons[p.id];
          return h('div', { class: 'rv-person' }, portrait(m, p, 'sm'), h('b', {}, p.name), h('span', { class: `status-pill s-${r.status.toLowerCase()}` }, r.status), cites(r.cites));
        })),
      ];
    }
    if (kind === 'motive') {
      return [h('div', { class: 'kicker' }, 'Your sheet · Motive'),
        st.sheet.motive.trim() ? h('blockquote', { class: 'rv-ans' }, st.sheet.motive) : h('p', { class: 'muted' }, 'Nothing written.')];
    }
    return [];
  }

  const cites = list => (list.length ? h('div', { class: 'chips' }, list.map(c => h('span', { class: 'chip' }, c))) : h('p', { class: 'muted small' }, 'No citations.'));

  function sideCard(step) {
    if (step.sheet === 'verdict') {
      const opt = optionOf(m, st.final.option);
      const right = opt.type === m.accusation.determination && !opt.reconsider;
      return h('aside', { class: `rv-side verdict-side ${right ? 'right' : 'wrong'}` },
        h('div', { class: 'kicker' }, `Your finding, signed by ${st.final.signedBy}`),
        h('div', { class: 'finding-text' }, opt.label),
        h('div', { class: 'verdict-mark' }, icon(right ? 'check' : 'close'), right ? 'Your finding matches.' : 'Not this.'),
        h('p', { class: 'muted' }, st.accusations.length > 1
          ? `Reached on accusation ${st.final.n}, after ${plural(wrongCount(st), 'Reconsider envelope')}.`
          : 'Reached on the first accusation.'));
    }
    if (step.sheet === 'epilogue') {
      return h('aside', { class: 'rv-side' },
        h('div', { class: 'kicker' }, 'Your table'),
        h('div', { class: 'rv-stat' }, h('b', {}, fmtClock(st.final.at)), h('span', {}, 'on the clock')),
        h('div', { class: 'rv-stat' }, h('b', {}, `${st.spent.length} of ${st.budget}`), h('span', {}, 'Authorities spent')),
        st.breakthroughs.length ? [h('div', { class: 'kicker' }, 'Breakthroughs'),
          h('ol', { class: 'bt-list' }, st.breakthroughs.map(b => h('li', {}, h('span', { class: 'mono' }, fmtClock(b.at)), b.note || 'Breakthrough')))] : null);
    }
    const checks = step.checks || [];
    return h('aside', { class: 'rv-side' },
      sheetAnswer(step),
      checks.length ? h('div', { class: 'rv-checks' },
        h('div', { class: 'kicker' }, 'Score it honestly'),
        h('p', { class: 'hint' }, 'Tick only what was on your sheet, with a citation, before the final accusation.'),
        checks.map(c => checkRow(c, step))) : null,
      step.note ? h('p', { class: 'hint' }, step.note) : null);
  }

  function checkRow(c, step) {
    const dbl = m.reveal.double && c.kind === 'step';
    const idx = step.sheet.startsWith('step:') ? +step.sheet.split(':')[1] : -1;
    if (dbl && st.reveal.doubles[c.id] === undefined) st.reveal.doubles[c.id] = !!(idx >= 0 && st.sheet.steps[idx].early);
    const sub = dbl ? h('label', { class: 'check sub' },
      h('input', { type: 'checkbox', checked: st.reveal.doubles[c.id], disabled: !st.reveal.checks[c.id],
        onchange: e => { st.reveal.doubles[c.id] = e.target.checked; save(); } }),
      h('span', {}, m.scoring.doubleLabel), h('span', { class: 'pts' }, 'x2')) : null;
    return h('div', { class: 'check-wrap' },
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!st.reveal.checks[c.id],
          onchange: e => { st.reveal.checks[c.id] = e.target.checked; save(); if (sub) sub.querySelector('input').disabled = !e.target.checked; } }),
        h('span', {}, c.label), h('span', { class: 'pts' }, `+${c.points}`)),
      sub);
  }

  function finish() {
    st.score = computeScore(m, st);
    st.status = 'done';
    save();
    go(`#/play/${m.id}`);
  }

  const onKey = e => {
    if (e.target.closest && e.target.closest('input, textarea') || document.querySelector('.modal-wrap, .fx-overlay')) return;
    if (e.key === 'ArrowRight' && st.reveal.i < count - 1) move(1);
    if (e.key === 'ArrowLeft') move(-1);
  };
  document.addEventListener('keydown', onKey);
  render();
  return () => document.removeEventListener('keydown', onKey);
}

/* --- score ------------------------------------------------------------------ */
export function computeScore(m, st) {
  const sc = m.scoring;
  const opt = optionOf(m, st.final.option);
  const lines = [];
  const determined = opt.type === m.accusation.determination;
  const correct = determined && !opt.reconsider;
  lines.push({ label: sc.determination.label, pts: determined ? sc.determination.points : 0 });
  lines.push({ label: sc.culprit.label, pts: correct ? sc.culprit.points : 0 });
  let allSteps = true, allPersons = true;
  for (const step of m.reveal.steps) {
    for (const c of step.checks || []) {
      const got = !!st.reveal.checks[c.id];
      if (c.kind === 'step' && !got) allSteps = false;
      if (c.kind === 'person' && !got) allPersons = false;
      const x2 = got && m.reveal.double && c.kind === 'step' && st.reveal.doubles[c.id];
      lines.push({ label: c.label + (x2 ? ' (x2)' : ''), pts: got ? c.points * (x2 ? 2 : 1) : 0 });
    }
  }
  const wrong = wrongCount(st);
  if (wrong) lines.push({ label: `${sc.wrong.label} x${wrong}`, pts: sc.wrong.points * wrong });
  const sweep = allSteps && allPersons && wrong === 0 && correct;
  lines.push({ label: sc.cleanSweep.label, pts: sweep ? sc.cleanSweep.points : 0 });
  const unspent = st.budget - st.spent.length;
  lines.push({ label: `${sc.unspent.label} x${unspent}`, pts: unspent * sc.unspent.points });
  const hints = hintsTaken(m, st);
  if (hints.levels) lines.push({ label: `Advice from the Unit x${hints.levels}`, pts: -hints.cost });
  const total = lines.reduce((a, l) => a + l.pts, 0);
  const band = sc.bands.find(b => total >= b.min) || sc.bands[sc.bands.length - 1];
  return { lines, total, band, correct };
}

export function mountScore(root, m, st, { go }) {
  const sc = st.score || computeScore(m, st);
  const opt = optionOf(m, st.final.option);
  const totalEl = h('div', { class: 'score-total' }, '0');
  const result = () => ({
    caseId: m.id, name: (st.posted && st.posted.name) || store.load(NAME_KEY) || 'A detective',
    time: st.final.at, score: sc.total, band: sc.band.title, correct: sc.correct, accusations: st.final.n,
  });

  const summary = () => [
    `PROJECT SYNAPSE - Case ${m.number}: ${m.title}`,
    `${fmtClock(st.final.at)} on the clock, ${sc.total} points, ${sc.band.title}`,
    `Finding: ${opt.label} (accusation ${st.final.n} of 3)`,
    `Authorities: ${st.spent.length} of ${st.budget} spent${st.spent.length ? ` (${st.spent.map(s => s.n).join(', ')})` : ''}`,
    ...(st.breakthroughs.length ? ['Breakthroughs:', ...st.breakthroughs.map(b => `  ${fmtClock(b.at)}  ${b.note || 'Breakthrough'}`)] : []),
  ].join('\n');

  const copyText = async (text, done) => {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch { modal({ title: 'Copy this', body: h('textarea', { class: 'field mono', rows: 6, value: text }), actions: [{ label: 'Done', kind: 'primary' }] }); }
  };

  const readAll = () => {
    const r = m.reveal;
    modal({
      title: 'Envelope S-1, in full', className: 'wide paper-modal',
      body: h('div', { class: 'paper' }, [r.cover, ...r.pages, r.scoringPage].map(p => pageNode(m, r.src, p))),
      actions: [{ label: 'Close', kind: 'primary' }],
    });
  };

  const replay = async () => {
    const ok = await confirmModal({ title: 'Play this case again?', body: h('p', {}, 'This clears the saved investigation on this device. A replay cannot be posted to the leaderboard, because you know the answer now.'), confirm: 'Start fresh', danger: true });
    if (ok) { clearState(m.id); go(`#/play/${m.id}`); }
  };

  /* leaderboard + share card */
  const NAME_HINT = 'Shown publicly with your score and time. 2-20 characters. Keep it clean.';
  const postCard = h('div', { class: 'card post-card' });
  function drawPost(err) {
    const meta = { number: m.number, title: m.title, tier: m.tier };
    const shareRow = h('div', { class: 'share-row' },
      navigator.share ? h('button', { class: 'btn', onclick: async () => { if (!(await nativeShare(result(), meta))) copyText(resultUrl(result()), 'Link copied'); } }, icon('share'), 'Share') : null,
      h('button', { class: 'btn', onclick: () => copyText(`${shareText(result(), m.title)}\n${resultUrl(result())}`, 'Link copied') }, icon('link'), 'Copy link'),
      h('button', { class: 'btn ghost', onclick: () => downloadCard(result(), meta) }, icon('download'), 'Image'));
    if (st.posted) {
      postCard.replaceChildren(
        h('div', { class: 'card-h' }, icon('trophy'), 'Leaderboard'),
        h('p', { class: 'posted' }, icon('check'), `Posted as ${st.posted.name}`, st.posted.rank ? h('b', {}, ` · rank #${st.posted.rank}${st.posted.global ? '' : ' on this device'}`) : ''),
        h('a', { class: 'linkbtn', href: `#/leaderboard/${m.id}` }, 'See the leaderboard'),
        h('div', { class: 'card-h share-h' }, icon('share'), 'Share your result'), shareRow);
      return;
    }
    const blocked = !st.firstAttempt ? 'This was not your first attempt at this case, so it cannot be posted. You can still share it.'
      : st.final.at < MIN_TIME ? 'Runs under one minute cannot be posted.' : null;
    const input = h('input', { class: 'field', maxlength: 20, placeholder: 'Name or username', 'aria-label': 'Name or username', value: store.load(NAME_KEY) || '', disabled: !!blocked });
    const msg = h('p', { class: `name-msg ${err ? 'bad' : ''}` }, err || NAME_HINT);
    const post = async btn => {
      const name = cleanName(input.value);
      const problem = checkName(name);
      if (problem) { msg.textContent = problem; msg.classList.add('bad'); input.focus(); return; }
      btn.disabled = true; btn.textContent = 'Posting...';
      try {
        const res = await submitScore({
          case_id: m.id, name, score: sc.total, time_ms: Math.round(st.final.at), band: sc.band.title,
          correct: sc.correct, accusations: st.final.n, authorities: st.spent.length,
        });
        store.save(NAME_KEY, name);
        st.posted = { name, rank: res.rank, global: res.global, at: Date.now() };
        saveState(st);
        toast(res.rank ? `Posted. You are #${res.rank}.` : 'Posted.');
        drawPost();
      } catch (e) {
        drawPost(String(e.message || e));
      }
    };
    const btn = h('button', { class: 'btn primary', disabled: !!blocked, onclick: e => post(e.currentTarget) }, icon('trophy'), 'Post score');
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !blocked) post(btn); });
    input.addEventListener('input', () => { msg.classList.remove('bad'); msg.textContent = NAME_HINT; });
    postCard.replaceChildren(
      h('div', { class: 'card-h' }, icon('trophy'), 'Post to the leaderboard'),
      ...(blocked ? [h('p', { class: 'hint' }, blocked)] : [h('div', { class: 'post-row' }, input, btn), msg]),
      h('div', { class: 'card-h share-h' }, icon('share'), 'Share your result'), shareRow);
  }
  drawPost();

  append(clear(root), h('main', { class: 'scene score' }, h('div', { class: 'stage-inner' },
    h('div', { class: 'kicker' }, `Case ${m.number} · ${m.title} · Scored`),
    h('div', { class: 'score-hero' },
      h('div', {}, totalEl, h('div', { class: 'score-l' }, 'points')),
      h('div', { class: 'band' }, h('div', { class: 'band-stamp' }, sc.band.title), h('p', {}, sc.band.text),
        h('p', { class: 'score-time' }, icon('clock'), `${fmtClock(st.final.at)} on the clock`))),
    h('div', { class: 'score-grid' },
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, icon('sheet'), 'Score the file, not the guess'),
        h('table', { class: 'score-table' }, sc.lines.map(l => h('tr', { class: l.pts ? '' : 'zero' }, h('td', {}, l.label), h('td', { class: 'n' }, l.pts > 0 ? `+${l.pts}` : String(l.pts)))),
          h('tr', { class: 'sum' }, h('td', {}, 'Total'), h('td', { class: 'n' }, String(sc.total))))),
      h('div', { class: 'score-side' },
        postCard,
        h('div', { class: 'card' },
          h('div', { class: 'card-h' }, icon('clock'), 'Your investigation'),
          h('div', { class: 'rv-stat' }, h('b', {}, fmtClock(st.final.at)), h('span', {}, 'on the clock')),
          h('div', { class: 'rv-stat' }, h('b', {}, `${st.spent.length} / ${st.budget}`), h('span', {}, 'Authorities spent')),
          h('div', { class: 'rv-stat' }, h('b', {}, String(st.final.n)), h('span', {}, `accusation${st.final.n > 1 ? 's' : ''} made`)),
          st.breakthroughs.length ? [h('div', { class: 'kicker' }, 'Breakthroughs'),
            h('ol', { class: 'bt-list' }, st.breakthroughs.map(b => h('li', {}, h('span', { class: 'mono' }, fmtClock(b.at)), b.note || 'Breakthrough')))] : null),
        h('div', { class: 'card debrief' },
          h('div', { class: 'card-h' }, icon('bulb'), 'Worth asking afterwards'),
          h('ol', {}, m.debrief.map(q => h('li', {}, q)))))),
    h('div', { class: 'score-actions' },
      h('a', { class: 'btn', href: `#/leaderboard/${m.id}` }, icon('trophy'), 'Leaderboard'),
      m.replay ? h('a', { class: 'btn primary', href: `#/replay/${m.id}` }, icon('eye'), 'Replay the file') : null,
      h('button', { class: 'btn', onclick: readAll }, 'Read Envelope S-1 in full'),
      h('button', { class: 'btn ghost', onclick: () => copyText(summary(), 'Summary copied') }, 'Copy notes'),
      h('button', { class: 'btn ghost', onclick: replay }, 'Play again'),
      h('a', { class: 'btn ghost', href: '#/' }, icon('home'), 'All cases')))));

  // Count the total up, unless the viewer prefers no motion.
  const reduce = motionReduced();
  if (reduce) totalEl.textContent = sc.total;
  else {
    const t0 = performance.now(), dur = 1100;
    const stepFn = t => {
      const p = Math.min(1, (t - t0) / dur);
      totalEl.textContent = Math.round(sc.total * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }
  return () => {};
}
