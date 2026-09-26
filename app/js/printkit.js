// The print-and-play kit: ready-made PDFs, previews, labels, and a checklist.

import { h, icon, confirmModal, modal, append, clear, store, toast } from './util.js';
import { srcUrl, loadCaseDocs, pageNode } from './docs.js';

const kb = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function loadPdfIndex(m) {
  try {
    const r = await fetch(`${m.base}print/pdf/index.json`, { cache: 'no-cache' });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

const spoilerBody = () => [h('p', {}, 'This is sealed material: the Authority results, the Reconsider inserts and the solution. Only the person printing should open it.'),
  h('p', { class: 'hint' }, 'If you plan to play, hand this step to somebody else, or print it face-down without looking.')];

async function spoilerGate(name) {
  return confirmModal({ kicker: 'Spoilers', title: `${name} contains the answers`, body: spoilerBody(), confirm: 'I am printing, not playing', danger: true });
}

export function renderPrintKit(app, m) {
  const k = m.printKit;
  const pdfUrl = file => `${m.base}print/pdf/${file}`;
  const root = h('div', { class: 'page wide kit' });
  append(clear(app), root);

  const download = async (file, spoiler, label) => {
    if (spoiler && !(await spoilerGate(label))) return;
    const a = h('a', { href: pdfUrl(file), download: `${m.id}-${file}` });
    document.body.append(a); a.click(); a.remove();
    toast(`Downloading ${label}`);
  };
  const openPdf = async (file, spoiler, label) => {
    if (spoiler && !(await spoilerGate(label))) return;
    window.open(pdfUrl(file), '_blank', 'noopener');
  };
  const openHtml = async f => {
    if (f.spoiler && !(await spoilerGate(f.name))) return;
    window.open(srcUrl(m, f.src), '_blank', 'noopener');
  };
  const preview = async f => {
    const dlg = modal({ title: `${f.name} - preview`, className: 'wide paper-modal', body: h('div', { class: 'boot inline' }, h('span', { class: 'brand-mark spin' }), 'Loading...'), actions: [{ label: 'Close', kind: 'primary' }] });
    try {
      await loadCaseDocs(m);
      const pages = m._pages[f.src].map((_, i) => pageNode(m, f.src, i));
      dlg.body.replaceChildren(h('div', { class: 'paper' }, pages));
    } catch (e) { dlg.body.replaceChildren(h('p', {}, String(e.message || e))); }
  };

  function draw(index) {
    const byFile = src => index && index.files.find(x => x.src === src);
    const pack = id => index && index.packs.find(x => x.id === id);
    const player = pack('player'), sealed = pack('sealed'), labels = pack('labels');
    const done = store.load(`synapse:kit:${m.id}`) || [];

    const packCard = (p, { title, text, icon: ic, spoiler, extra }) => h('div', { class: `pack ${spoiler ? 'spoiler' : ''}` },
      h('div', { class: 'pack-ic' }, icon(ic)),
      h('div', { class: 'pack-main' },
        h('div', { class: 'pack-title' }, title, spoiler ? h('span', { class: 'tag danger' }, 'Printer only') : h('span', { class: 'tag ok' }, 'Safe to read')),
        h('p', {}, text),
        p ? h('div', { class: 'pack-meta' }, `${p.pages ? `${p.pages} pages · ` : ''}PDF · ${kb(p.bytes)}`) : null),
      h('div', { class: 'pack-actions' },
        p ? h('button', { class: `btn ${spoiler ? 'ghost' : 'primary'}`, onclick: () => download(p.file, spoiler, title) }, icon('download'), 'Download') : h('span', { class: 'muted' }, 'PDF not built'),
        p ? h('button', { class: 'btn ghost', onclick: () => openPdf(p.file, spoiler, title) }, icon('print'), 'Open to print') : null,
        extra || null));

    const checklist = h('ol', { class: 'kit-check' }, (k.checklist || []).map((item, i) => h('li', {},
      h('label', { class: `check ${done.includes(i) ? 'done' : ''}` },
        h('input', { type: 'checkbox', checked: done.includes(i), onchange: e => {
          const list = new Set(store.load(`synapse:kit:${m.id}`) || []);
          if (e.target.checked) list.add(i); else list.delete(i);
          store.save(`synapse:kit:${m.id}`, [...list]);
          e.target.closest('.check').classList.toggle('done', e.target.checked);
          prog.textContent = `${list.size} of ${k.checklist.length} done`;
        } }),
        h('span', {}, item)))));
    const prog = h('span', { class: 'muted' }, `${done.length} of ${(k.checklist || []).length} done`);

    append(clear(root), [
      h('a', { class: 'back', href: '#/' }, icon('left'), 'All cases'),
      h('div', { class: 'kicker' }, `Case ${m.number} · ${m.tier} · Print & play`),
      h('h1', { class: 'display sm' }, m.title),
      h('p', { class: 'lead' }, 'Everything you need to put this case on a real table, for 1 to 6 detectives. The PDFs are exact A4 and print correctly with any settings.'),
      index === null ? h('div', { class: 'callout warn' }, 'The PDFs for this case have not been built yet. Run "npm run pdf" in the project folder, or use the HTML files below.') : null,
      h('div', { class: 'kit-layout' },
        h('div', { class: 'kit-main' },
          h('h2', { class: 'section-h' }, 'The kit'),
          packCard(player, { title: 'Player pack', icon: 'file', text: 'The case file, briefing, Authority menu and Resolution Sheet. Everyone at the table may read all of it.',
            extra: h('button', { class: 'btn ghost', onclick: () => preview(k.files.find(f => !f.spoiler)) }, icon('eye'), 'Preview') }),
          packCard(sealed, { title: 'Sealed pack', icon: 'lock', spoiler: true, text: 'Authority results, Reconsider inserts and Envelope S-1. Printed face-down by someone who is not playing, then sealed in envelopes.' }),
          packCard(labels, { title: 'Envelope labels', icon: 'tag', text: `${labels && labels.labels ? `${labels.labels} labels` : 'Labels'} to cut out and stick on your envelopes, so every Authority, Reconsider and S-1 envelope is marked. Contains no spoilers.` }),

          h('h2', { class: 'section-h' }, 'Individual files'),
          h('p', { class: 'hint' }, 'Reprint a single part, such as a fresh Resolution Sheet for a new group.'),
          h('div', { class: 'kit-files' }, k.files.map((f, i) => {
            const pdf = byFile(f.src);
            return h('div', { class: `kit-file ${f.spoiler ? 'spoiler' : ''}` },
              h('span', { class: 'kit-n' }, i + 1),
              h('div', { class: 'kit-main' },
                h('div', { class: 'kit-name' }, f.name, f.spoiler ? h('span', { class: 'tag danger' }, 'Spoilers') : null),
                h('div', { class: 'muted' }, `${pdf && pdf.pages ? pdf.pages : f.pages} pages · ${f.what}`)),
              h('div', { class: 'kit-acts' },
                pdf ? h('button', { class: 'btn sm', onclick: () => download(pdf.file, f.spoiler, f.name) }, icon('pdf'), 'PDF') : null,
                !f.spoiler ? h('button', { class: 'btn sm ghost', onclick: () => preview(f), title: 'Preview' }, icon('eye')) : null,
                h('button', { class: 'btn sm ghost', onclick: () => openHtml(f), title: 'Open the original HTML' }, 'HTML')));
          })),

          h('details', { class: 'card kit-html' },
            h('summary', {}, 'Printing the HTML files instead?'),
            h('ul', { class: 'rules' },
              h('li', {}, 'Use Chrome or Edge. Open the file, press Ctrl+P (Cmd+P on Mac).'),
              h('li', {}, h('b', {}, 'Headers and footers: OFF. '), 'Otherwise every page carries a URL and the documents stop looking real.'),
              h('li', {}, h('b', {}, 'Background graphics: ON. '), 'Otherwise the shaded boxes vanish, including ones the case turns on.'),
              h('li', {}, 'A4, default margins, 100% scale. Some pages may run onto a second sheet; the PDFs are fitted to avoid this.')),
            h('a', { class: 'linkbtn', href: m.base + k.guide, target: '_blank', rel: 'noopener' }, 'Full page-by-page print guide'))),

        h('aside', { class: 'kit-side' },
          h('div', { class: 'card' },
            h('div', { class: 'card-h' }, icon('envelope'), 'You will need'),
            h('ul', { class: 'rules' }, h('li', {}, k.sheets), h('li', {}, k.envelopes), h('li', {}, 'Two pencils, and a phone calculator.'))),
          k.checklist ? h('div', { class: 'card' },
            h('div', { class: 'card-h' }, icon('check'), 'Assembly checklist', prog),
            checklist,
            h('button', { class: 'linkbtn', onclick: () => { store.remove(`synapse:kit:${m.id}`); draw(index); } }, 'Clear checklist')) : null,
          h('a', { class: 'btn block', href: `#/play/${m.id}` }, 'Or play it digitally', icon('arrow'))))]);
  }

  draw(undefined);
  loadPdfIndex(m).then(draw);
  return () => {};
}
