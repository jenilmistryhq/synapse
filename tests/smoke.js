#!/usr/bin/env node
/**
 * End-to-end smoke test for every case, in a real (headless) browser.
 *
 *   npm test                 all cases
 *   npm test -- SYN-MVP-003  one case
 *
 * For each case it plays the whole game the quick way: open the desk, check every
 * document is on it, read one, spend an Authority, make the correct accusation,
 * tick every reveal step, and check the final score is exactly what the case's own
 * scoring rules say it should be. Then it checks every replay clue finds its
 * passage and the print kit page renders. Any console error or warning fails it.
 *
 * Network calls outside this machine (the leaderboard) are blocked, so the test
 * never touches the live database. Needs Chrome or Edge (or set CHROME_PATH).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/?nosw`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  return [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean).find(p => fs.existsSync(p));
}

// What to write on the Resolution Sheet so every scoring rule is met: one citation
// from each group (a document if the group has one, otherwise an Authority result,
// which then has to be spent), each person's finding, and a motive if one scores.
function sheetPlan(m) {
  const plan = { steps: {}, persons: {}, slips: new Set(), motive: false };
  const pick = g => g.find(x => !x.startsWith('SLIP ')) || g[0];
  for (const step of m.reveal.steps) {
    for (const c of step.checks || []) {
      const a = c.auto;
      if (!a) continue;
      const cites = (a.cites || []).map(pick);
      cites.filter(x => x.startsWith('SLIP ')).forEach(x => plan.slips.add(x.slice(5)));
      if (a.motive) plan.motive = true;
      else if (a.person) plan.persons[a.person] = { status: [].concat(a.status)[0], cites: [...new Set([...(plan.persons[a.person] || { cites: [] }).cites, ...cites])] };
      else { const i = +step.sheet.split(':')[1]; plan.steps[i] = [...new Set([...(plan.steps[i] || []), ...cites])]; }
    }
  }
  plan.slips = [...plan.slips];
  return plan;
}

// A perfect, unphased, first-time run with those Authorities spent must score this.
function expectedScore(m, spent) {
  const s = m.scoring;
  let total = s.determination.points + s.culprit.points + s.cleanSweep.points;
  for (const step of m.reveal.steps) for (const c of step.checks || []) total += c.points;
  return total + (m.budget['1'] - spent) * s.unspent.points;
}

async function main() {
  const only = process.argv[2];
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'cases', 'index.json'), 'utf8'));
  const cases = catalog.cases.filter(c => !only || c.id === only);
  if (!cases.length) throw new Error(`No case ${only}`);
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome or Edge not found. Set CHROME_PATH.');

  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js'), String(PORT)], { stdio: 'ignore' });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const failures = [];
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await sleep(150); } }
    for (const c of cases) {
      const m = require('../tools/case-files.js').readCase(path.join(ROOT, 'cases', c.id));
      const t0 = Date.now();
      try {
        await playCase(browser, m);
        console.log(`  ok  ${c.id}  ${m.title}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      } catch (e) {
        failures.push(`${c.id}: ${e.message}`);
        console.log(`  FAIL ${c.id}  ${e.message}`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (failures.length) { console.error(`\n${failures.length} case(s) failed.`); process.exit(1); }
  console.log(`\nAll ${cases.length} case(s) passed.`);
}

async function playCase(browser, m) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const problems = [];
  p.on('pageerror', e => problems.push(`page error: ${e.message}`));
  p.on('console', msg => { if (['error', 'warn', 'warning'].includes(msg.type())) problems.push(`console ${msg.type()}: ${msg.text()}`); });
  await p.setRequestInterception(true);
  p.on('request', req => (/^https?:\/\/localhost[:/]/.test(req.url()) || req.url().startsWith('data:') ? req.continue() : req.abort()));
  const check = (ok, what) => { if (!ok) throw new Error(what); };
  const click = async (sel, text) => {
    const ok = await p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => !text || e.textContent.includes(text)); if (!el) return false; el.click(); return true; }, sel, text);
    check(ok, `could not find ${sel}${text ? ` "${text}"` : ''}`);
    await sleep(450);
  };
  const ensureClean = where => { if (problems.length) throw new Error(`${where}: ${problems[0]}`); };

  try {
    // setup: unphased (so everything is on the desk) and no guide
    await p.goto(`${BASE}#/play/${m.id}`, { waitUntil: 'networkidle0' }); await sleep(400);
    await p.evaluate(() => {
      const t = document.querySelector('.toggle input'); if (t && t.checked) t.click();
      const off = document.querySelector('.guide-opt input[value="off"]'); if (off) off.click();
    });
    await click('.btn.primary', 'Open the file'); await click('.btn.primary', 'Begin'); await sleep(700);
    await click('.tour-card .linkbtn', 'Skip');
    const onDesk = await p.evaluate(() => [...document.querySelectorAll('.dk-files .folder:not(.bundle)')].map(f => f.dataset.doc));
    const missing = m.documents.map(d => d.id).filter(id => !onDesk.includes(id));
    check(!missing.length, `documents missing from the desk: ${missing.join(', ')}`);

    // read one document
    await click(`.folder[data-doc="${m.documents.find(d => d.kind !== 'brief').id}"]`); await sleep(300);
    check(await p.evaluate(() => document.querySelectorAll('.rd-paper .doc').length > 0), 'the reader shows no pages');
    await p.keyboard.press('Escape'); await sleep(300);

    // spend the Authorities the scoring rules rely on (or one, to test the envelope)
    const plan = sheetPlan(m);
    check(plan.slips.length <= m.budget['1'], `a perfect sheet needs ${plan.slips.length} Authorities, the solo budget is ${m.budget['1']}`);
    const toSpend = plan.slips.length ? plan.slips : [null];
    for (const n of toSpend) {
      const ok = await p.evaluate(n => { const el = [...document.querySelectorAll('.mini-env:not(.locked)')].find(e => !n || e.querySelector('.mini-n').textContent === n); if (!el) return false; el.click(); return true; }, n);
      check(ok, `Authority ${n} is not on the desk`); await sleep(450);
      await click('.modal .btn.primary', 'Spend it'); await sleep(300);
      await click('.env-btn'); await sleep(2200);
      check(await p.evaluate(() => !document.querySelector('.rd').hidden), `the result of Authority ${n || ''} did not open`);
      await p.keyboard.press('Escape'); await sleep(300);
    }

    // write the sheet
    await click('.tool.t-clip'); await sleep(400);
    const people = Object.fromEntries(m.persons.list.map(x => [x.id, x.name]));
    await p.evaluate((plan, people) => {
      const steps = [...document.querySelectorAll('.form .form-step')];
      const cite = (input, v) => { input.value = v; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
      for (const [i, cites] of Object.entries(plan.steps)) {
        const ta = steps[i].querySelector('textarea'); ta.value = `Working for step ${+i + 1}`; ta.dispatchEvent(new Event('input', { bubbles: true }));
        for (const c of cites) cite(steps[i].querySelector('.cite-in'), c);
      }
      for (const [id, f] of Object.entries(plan.persons)) {
        const sel = document.querySelector(`select[aria-label="Finding for ${people[id]}"]`);
        sel.value = f.status; sel.dispatchEvent(new Event('change', { bubbles: true }));
        for (const c of f.cites) cite(sel.closest('tr').querySelector('.cite-in'), c);
      }
      if (plan.motive) { const ta = steps[steps.length - 1].querySelector('textarea'); ta.value = 'A motive'; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }, plan, people);
    await sleep(300);
    await click('.dw-head .iconbtn'); await sleep(300);

    // the correct accusation, first time
    const right = m.accusation.options.find(o => o.type === m.accusation.determination && !o.reconsider);
    await click('.stamp-btn', 'Accuse');
    await p.evaluate(v => document.querySelector(`input[value="${v}"]`).click(), right.id);
    await click('.modal .btn.danger'); await sleep(900);
    await click('.btn.primary', 'Break the seal'); await sleep(300); await click('.env-btn'); await sleep(2200);

    // the reveal: tick everything, step through to the score
    let steps = 1;
    for (let i = 0; i < 30; i++) {
      const last = await p.evaluate(() => document.querySelector('.rv-nav .btn.primary').textContent.includes('Score'));
      if (last) break;
      await p.evaluate(() => document.querySelectorAll('.rv-checks .check:not(.sub) input').forEach(c => { if (!c.checked) c.click(); }));
      await click('.rv-nav .btn.primary'); steps++;
    }
    // the reveal opens on the S-1 cover, then one screen per step
    check(steps === m.reveal.steps.length + 1, `the reveal has ${steps - 1} steps after the cover, the manifest lists ${m.reveal.steps.length}`);
    await click('.rv-nav .btn.primary', 'Score'); await sleep(1500);
    const got = await p.evaluate(() => parseInt(document.querySelector('.score-total').textContent, 10));
    const want = expectedScore(m, plan.slips.length || 1);
    check(got === want, `scored ${got}, the case's scoring rules give ${want}`);
    // a perfect first run earns the shared badges, and the case's own
    await sleep(500);
    const badges = await p.evaluate(() => [...document.querySelectorAll('.badges-card .badge b')].map(b => b.textContent));
    for (const t of ['First file closed', 'Right first time', 'Clean sweep', 'Paper trail', ...(m.badges || []).map(b => b.title)]) check(badges.includes(t), `the badge "${t}" was not awarded (got: ${badges.join(', ') || 'none'})`);
    ensureClean('during play');

    // replay: every clue marks its passage
    if (m.replay && m.replay.length) {
      await p.goto(`${BASE}#/replay/${m.id}`, { waitUntil: 'networkidle0' }); await sleep(900);
      const n = await p.evaluate(() => document.querySelectorAll('.rp-clue').length);
      check(n === m.replay.length, `replay lists ${n} clues of ${m.replay.length}`);
      for (let i = 0; i < n; i++) {
        await p.evaluate(i => document.querySelectorAll('.rp-clue')[i].click(), i); await sleep(150);
        const text = await p.evaluate(i => [...document.querySelectorAll(`.rp-scroll mark[data-clue="${i + 1}"]`)].map(x => x.textContent).join(''), i);
        check(text.replace(/\s+/g, '') === m.replay[i].find.replace(/\s+/g, ''), `replay clue ${i + 1} marks "${text.slice(0, 40)}"`);
      }
      ensureClean('in replay');
    }

    // the print kit
    await p.goto(`${BASE}#/print/${m.id}`, { waitUntil: 'networkidle0' }); await sleep(700);
    check(!(await p.evaluate(() => /(^|\s)(null|undefined|NaN)(\s|$)/.test(document.querySelector('main').innerText))), 'the print kit shows null or undefined');
    ensureClean('on the print kit');
  } finally {
    await ctx.close();
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
