#!/usr/bin/env node
/**
 * Builds print-ready A4 PDFs for every case, using a local Chrome or Edge.
 * Players then download exact PDFs instead of fiddling with browser print
 * settings (headers/footers, background graphics, scale).
 *
 * Output, per case, in cases/<id>/print/pdf/:
 *   01-....pdf ...          one PDF per print file
 *   player-pack.pdf         every spoiler-free file, in print order
 *   sealed-pack.pdf         every spoiler file (for whoever prints, not plays)
 *   envelope-labels.pdf     labels for every envelope in the kit
 *   index.json              what was built (the web app reads this)
 *
 * Usage:  npm install        (once, installs puppeteer-core)
 *         npm run pdf        or: node tools/build-pdfs.js [CASE-ID]
 * Chrome is found automatically; set CHROME_PATH to override.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch {
  console.error('puppeteer-core is not installed. Run "npm install" in the project folder first.');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const casesDir = path.join(root, 'cases');
const only = process.argv[2];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const docsOf = html => {
  // Every <div class="doc"> ... </div> at the top level of <body>, in order.
  const body = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  return body.replace(/^<body[^>]*>/, '').replace(/<div class="screenonly">[\s\S]*?<\/div>/, '');
};

// Documents that overflow A4 by a little are scaled down to fit one page (never
// below 80%, to stay legible). Longer ones flow onto a second page at full size.
// Returns the number of documents that still need more than one page.
const MM = 96 / 25.4;
const PAGE_H = 274 * MM;          // A4 height minus the 12 + 11 mm print margins in dossier.css
const MIN_ZOOM = 0.8;
async function fitDocs(page) {
  await page.emulateMediaType('print');
  await page.setViewport({ width: Math.round(184 * MM), height: 1200 });
  return page.evaluate((PAGE_H, MIN_ZOOM) => {
    let long = 0;
    for (const d of document.querySelectorAll('body > .doc')) {
      const h0 = d.getBoundingClientRect().height;
      if (h0 <= PAGE_H) continue;
      let fitted = false;
      for (let z = 0.98; z >= MIN_ZOOM - 1e-9; z -= 0.02) {
        d.style.zoom = String(z);
        if (d.getBoundingClientRect().height <= PAGE_H) { fitted = true; break; }
      }
      if (!fitted) { d.style.zoom = ''; long++; }
    }
    return long;
  }, PAGE_H, MIN_ZOOM);
}

async function printPdf(page, out) {
  const long = await fitDocs(page);
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  const pdf = fs.readFileSync(out, 'latin1');
  const counts = [...pdf.matchAll(/\/Count (\d+)/g)].map(x => +x[1]);
  return { bytes: pdf.length, pages: counts.length ? Math.max(...counts) : null, long };
}

async function pdfFromHtml(page, html, baseDir, out) {
  const tmp = path.join(baseDir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html);
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    return await printPdf(page, out);
  } finally { fs.unlinkSync(tmp); }
}

function labelsHtml(m, menuRows) {
  const labels = [
    ...menuRows.map(r => ({ big: `Authority ${r.n}`, small: r.text, note: 'Open only when this Authority is spent' })),
    ...m.accusation.options.filter(o => o.reconsider).map(o => ({ big: 'Reconsider', small: o.reconsider.title.replace(/^Reconsider - /, ''), note: 'Open only after this accusation', red: true })),
    { big: 'Envelope S-1', small: 'Case Resolution & Final Summary', note: 'Do not open until the final accusation is signed', red: true },
  ];
  const cells = labels.map(l => `<div class="label${l.red ? ' red' : ''}"><div class="k">Project Synapse · Case ${esc(m.number)}</div><div class="big">${esc(l.big)}</div><div class="small">${esc(l.small)}</div><div class="note">${esc(l.note)}</div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 3mm; }
    p.hint { font-size: 8.5pt; color: #444; margin: 0 0 5mm; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .label { border: 1.2pt dashed #555; height: 48mm; padding: 5mm 6mm; display: flex; flex-direction: column; break-inside: avoid; }
    .label.red { border-color: #000; border-style: solid; border-width: 2pt; }
    .k { font-size: 7pt; letter-spacing: .14em; text-transform: uppercase; color: #555; }
    .big { font-size: 22pt; font-weight: bold; letter-spacing: .06em; text-transform: uppercase; margin-top: 3mm; }
    .small { font-size: 9pt; margin-top: 2mm; line-height: 1.3; }
    .note { margin-top: auto; font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; color: #333; border-top: .5pt solid #999; padding-top: 1.5mm; }
  </style></head><body><h1>${esc(m.title)} · Envelope labels</h1>
  <p class="hint">Cut along the dashed lines and stick one label on each envelope. ${labels.length} labels.</p>
  <div class="grid">${cells}</div></body></html>`;
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('Could not find Chrome or Edge. Set CHROME_PATH to its executable.'); process.exit(1); }
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  let built = 0;
  for (const id of fs.readdirSync(casesDir).sort()) {
    if (only && id !== only) continue;
    const mPath = path.join(casesDir, id, 'digital.json');
    if (!fs.existsSync(mPath)) continue;
    const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    if (!m.printKit) continue;
    const printDir = path.join(casesDir, id, 'print');
    const outDir = path.join(printDir, 'pdf');
    fs.mkdirSync(outDir, { recursive: true });
    const index = { case: id, built: new Date().toISOString(), files: [], packs: [] };
    const css = fs.readFileSync(path.join(printDir, 'dossier.css'), 'utf8');
    const packs = { player: [], sealed: [] };

    for (const f of m.printKit.files) {
      const srcFile = path.join(casesDir, id, m.sources[f.src]);
      const name = path.basename(srcFile, '.html') + '.pdf';
      await page.goto(pathToFileURL(srcFile).href, { waitUntil: 'load' });
      const r = await printPdf(page, path.join(outDir, name));
      index.files.push({ src: f.src, file: name, bytes: r.bytes, pages: r.pages, spoiler: !!f.spoiler });
      console.log(`  ${name}: ${r.pages} pages${r.long ? ` (${r.long} long document${r.long > 1 ? 's' : ''} run to a second page)` : ''}`);
      (f.spoiler ? packs.sealed : packs.player).push(docsOf(fs.readFileSync(srcFile, 'utf8')));
    }

    const packHtml = parts => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${parts.join('\n')}</body></html>`;
    for (const [key, parts] of Object.entries(packs)) {
      if (!parts.length) continue;
      const file = `${key}-pack.pdf`;
      const r = await pdfFromHtml(page, packHtml(parts), printDir, path.join(outDir, file));
      index.packs.push({ id: key, file, bytes: r.bytes, pages: r.pages, spoiler: key === 'sealed' });
    }

    // Labels need the Authority menu rows: read them from the printed menu page.
    const menuHtml = fs.readFileSync(path.join(casesDir, id, m.sources[m.menu.src]), 'utf8');
    const rows = [...menuHtml.matchAll(/<td class="mono">(\d{2})<\/td><td>([\s\S]*?)<\/td>/g)]
      .map(x => ({ n: x[1], text: x[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() }));
    const lr = await pdfFromHtml(page, labelsHtml(m, rows), printDir, path.join(outDir, 'envelope-labels.pdf'));
    index.packs.push({ id: 'labels', file: 'envelope-labels.pdf', bytes: lr.bytes, pages: lr.pages, labels: rows.length + m.accusation.options.filter(o => o.reconsider).length + 1, spoiler: false });

    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    const total = [...index.files, ...index.packs].reduce((a, x) => a + x.bytes, 0);
    console.log(`${id}: ${index.files.length} files + ${index.packs.length} packs, ${(total / 1024).toFixed(0)} KB`);
    built++;
  }
  await browser.close();
  console.log(built ? `OK - PDFs built for ${built} case(s).` : 'No cases built.');
})().catch(e => { console.error(e); process.exit(1); });
