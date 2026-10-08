#!/usr/bin/env node
/**
 * Link previews for shared results. Chat apps and social sites ignore everything
 * after the # in a link, so a shared result needs a real page to describe it.
 *
 * For every case and every result band this draws a 1200 x 630 preview image and a
 * tiny page that carries it, at s/<caseId>/<band>.html. The page shows the preview
 * to link-unfurlers and sends people straight on to the result in the game. It also
 * gives the home page a title, description and image.
 *
 *   node tools/build-share.js [siteDir]     (default _site, after build-site.js)
 *
 * The site address comes from SITE_URL (the deploy workflow sets it), otherwise
 * https://jenilmistryhq.github.io/synapse/.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { readCase } = require('./case-files.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '_site'));
const SITE = (process.env.SITE_URL || 'https://jenilmistryhq.github.io/synapse/').replace(/\/?$/, '/');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function findChrome() {
  return [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
}

const fontCss = () => fs.readFileSync(path.join(ROOT, 'app', 'fonts.css'), 'utf8')
  .replace(/url\("fonts\/([^"]+)"\)/g, (_, f) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'app', 'fonts', f)).toString('base64')}")`);

// The card: dark desk, the case on a manila tab, and a red rubber stamp.
const card = ({ kicker, title, stamp, line }) => `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: radial-gradient(circle at 30% 20%, #2a2219, #110f0c 70%); color: #efe9dc; font-family: "IBM Plex Sans", sans-serif; display: flex; flex-direction: column; justify-content: center; padding: 0 90px; box-sizing: border-box; }
  .k { font: 600 26px/1 "IBM Plex Sans Condensed"; letter-spacing: .22em; text-transform: uppercase; color: #d84a33; }
  h1 { font: 700 ${title.length > 30 ? 62 : title.length > 26 ? 70 : 84}px/1.02 "IBM Plex Sans Condensed"; text-transform: uppercase; margin: 22px 0 34px; max-width: 1000px; }
  .stamp { align-self: flex-start; font: 700 44px/1 "IBM Plex Sans Condensed"; letter-spacing: .1em; text-transform: uppercase; color: #e2583f; border: 6px solid currentColor; border-radius: 10px; padding: 14px 26px 12px; transform: rotate(-3deg); }
  .line { margin-top: 44px; font: 500 30px/1.3 "IBM Plex Sans"; color: #c3baa9; }
  .brand { position: absolute; right: 90px; bottom: 56px; font: 600 22px/1 "IBM Plex Sans Condensed"; letter-spacing: .24em; text-transform: uppercase; color: #8f8676; }
</style></head><body><div class="k">${esc(kicker)}</div><h1>${esc(title)}</h1>${stamp ? `<div class="stamp">${esc(stamp)}</div>` : ''}<div class="line">${esc(line)}</div><div class="brand">Project Synapse</div></body></html>`;

const metaTags = ({ title, description, image, url }) => [
  `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="Project Synapse">`,
  `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(description)}">`,
  `<meta property="og:image" content="${esc(image)}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
  url ? `<meta property="og:url" content="${esc(url)}">` : '', `<meta name="twitter:card" content="summary_large_image">`,
].filter(Boolean).join('\n');

(async () => {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new Error(`${OUT} has no index.html. Run "node tools/build-site.js" first.`);
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome or Edge not found. Set CHROME_PATH.');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  const shoot = async (html, file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: file, type: 'png' }); };

  // the home page
  await shoot(card({ kicker: 'Deductive case files', title: 'Read the file. Prove who did it.', stamp: '', line: 'Solo mysteries in your browser, or print-and-play kits.' }), path.join(OUT, 's', 'site.png'));
  const indexPath = path.join(OUT, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  if (!index.includes('og:image')) {
    index = index.replace('<meta name="theme-color"', `${metaTags({ title: 'Project Synapse', description: 'Solo deductive murder mysteries built from case files. Play in your browser, or download print-and-play PDFs.', image: `${SITE}s/site.png`, url: SITE })}\n<meta name="theme-color"`);
    fs.writeFileSync(indexPath, index);
  }

  let pages = 0;
  for (const id of fs.readdirSync(path.join(ROOT, 'cases')).sort()) {
    if (!fs.existsSync(path.join(ROOT, 'cases', id, 'sealed.json'))) continue;
    const m = readCase(path.join(ROOT, 'cases', id));
    for (const [i, band] of m.scoring.bands.entries()) {
      const dir = path.join(OUT, 's', id);
      await shoot(card({ kicker: `Case ${m.number} · ${m.tier}`, title: m.title, stamp: band.title, line: 'A detective closed this file. Can you beat it?' }), path.join(dir, `${i}.png`));
      fs.writeFileSync(path.join(dir, `${i}.html`), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(band.title)} - ${esc(m.title)} - Project Synapse</title>
<meta name="description" content="${esc(`Case ${m.number}, ${m.title}: closed as "${band.title}". Can you beat it?`)}">
${metaTags({ title: `${band.title}: ${m.title}`, description: `A detective closed Case ${m.number}. ${m.tagline} Can you beat it?`, image: `${SITE}s/${id}/${i}.png` })}
<script>location.replace('../../' + (location.hash.length > 1 ? '#/r/' + location.hash.slice(1) : '#/play/${id}'));</script>
</head>
<body style="background:#110f0c;color:#efe9dc;font-family:sans-serif;padding:40px">
<p><a style="color:#e6b04a" href="../../#/play/${id}">Open ${esc(m.title)} in Project Synapse</a></p>
</body>
</html>
`);
      pages++;
    }
  }
  await browser.close();
  console.log(`OK - ${pages} result previews and the home page card, for ${SITE}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
