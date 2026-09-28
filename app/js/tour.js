// A guided first look at the desk: each step spotlights one real element and
// explains it. Skippable, keyboard-friendly, and replayable from Help.

import { h } from './util.js';

export function runTour(steps, { onDone } = {}) {
  const list = steps.filter(s => document.querySelector(s.sel));
  if (!list.length) { if (onDone) onDone(); return () => {}; }
  let i = 0;
  const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Desk tour' });
  const root = h('div', { class: 'tour' }, spot, card);
  document.body.append(root);

  function place() {
    const el = document.querySelector(list[i].sel);
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 8;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    let top = r.bottom + pad + gap;
    if (top + ch > innerHeight - 12) top = r.top - pad - gap - ch;
    if (top < 12) top = Math.max(12, innerHeight - ch - 12);
    const left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  }

  function show() {
    const s = list[i];
    const el = document.querySelector(s.sel);
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const last = i === list.length - 1;
    const next = h('button', { class: 'btn sm primary', onclick: () => go(1) }, last ? 'Start investigating' : 'Next');
    card.replaceChildren(
      h('div', { class: 'tour-top' }, h('span', { class: 'kicker' }, `Desk tour · ${i + 1} of ${list.length}`),
        h('button', { class: 'linkbtn', onclick: finish }, 'Skip tour')),
      h('h3', {}, s.title),
      h('p', {}, s.text),
      h('div', { class: 'tour-btns' },
        i > 0 ? h('button', { class: 'btn sm ghost', onclick: () => go(-1) }, 'Back') : h('span'),
        next));
    requestAnimationFrame(() => { place(); next.focus(); });
  }

  function go(d) {
    if (i + d >= list.length) return finish();
    i = Math.max(0, i + d);
    show();
  }

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
  };
  const onResize = () => place();
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  document.addEventListener('scroll', onResize, true);

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onResize, true);
    root.remove();
    if (onDone) onDone();
  }

  show();
  return finish;
}
