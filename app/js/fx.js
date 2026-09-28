// The tactile moment: breaking a seal.

import { h, icon } from './util.js';
import { motionReduced as reducedMotion } from './settings.js';

// A sealed envelope the table has to open on purpose. Resolves once opened.
export function openEnvelope({ kicker = 'Sealed', label, sub, tone = '', button = 'Break the seal' }) {
  return new Promise(resolve => {
    const env = h('div', { class: `env ${tone}` },
      h('div', { class: 'env-back' }),
      h('div', { class: 'env-paper' }, h('i'), h('i'), h('i'), h('i')),
      h('div', { class: 'env-front' },
        h('div', { class: 'env-kicker' }, kicker),
        h('div', { class: 'env-label' }, label),
        sub ? h('div', { class: 'env-sub' }, sub) : null),
      h('div', { class: 'env-flap' }),
      h('div', { class: 'env-seal' }, icon('seal')));
    const btn = h('button', { class: 'btn primary lg env-btn' }, icon('seal'), button);
    const ov = h('div', { class: 'fx-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
      h('div', { class: 'env-stage' }, env, btn));
    document.body.append(ov);
    requestAnimationFrame(() => { ov.classList.add('in'); btn.focus(); });
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      btn.disabled = true;
      env.classList.add('open');
      setTimeout(() => {
        ov.classList.remove('in');
        setTimeout(() => { ov.remove(); resolve(); }, 260);
      }, reducedMotion() ? 60 : 1150);
    };
    btn.addEventListener('click', open);
    env.addEventListener('click', open);
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') open(); });
  });
}
