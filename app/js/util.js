// Small DOM and storage helpers shared by every screen.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let pendingValue;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') pendingValue = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  if (pendingValue !== undefined) el.value = pendingValue;
  return el;
}

export function append(el, kids) {
  for (const k of [kids].flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : String(k));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

export function debounce(fn, ms = 400) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export const store = {
  load(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
};

/* --- icons --------------------------------------------------------------- */
const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
  accuse: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  envelope: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.4M6.7 6.7C4.3 8.2 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.9-1"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
  notes: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  sheet: '<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4h6v3H9zM8 11h8M8 15h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2.5 3 5"/>',
  marker: '<path d="M4 20h7M14 4l6 6-9 9H5v-6z"/>',
  quote: '<path d="M7 7h4v4c0 3-2 5-4 5M14 7h4v4c0 3-2 5-4 5"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="1"/><path d="M7 14h10v7H7z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  seal: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 15a7.5 7.5 0 1 0 1.8-7.8L4 10"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pdf: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-5M14 11v5M14 11h2M14 13.5h1.5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4H9z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
};

export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = `ic ${cls}`.trim();
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
}

/* --- toasts -------------------------------------------------------------- */
export function toast(msg, kind = '') {
  let host = $('#toasts');
  if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  host.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* --- modals -------------------------------------------------------------- */
// modal({ title, body, actions:[{label, kind, onClick, close}], dismissible, className })
// onClick may return false to keep the modal open.
const openModals = new Set();
// Close every open dialog (used when the route changes).
export function closeAllModals() { [...openModals].forEach(close => close(true)); }

export function modal({ title, kicker, body, actions = [], dismissible = true, className = '', onClose } = {}) {
  const prevFocus = document.activeElement;
  const box = h('div', { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const wrap = h('div', { class: 'modal-wrap' }, box);
  const close = silent => {
    silent = silent === true;
    if (!openModals.has(close)) return;
    openModals.delete(close);
    document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 200);
    if (silent) return;
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  const onKey = e => {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') trapFocus(e, box);
  };
  if (dismissible) {
    box.append(h('button', { class: 'modal-x', 'aria-label': 'Close', onclick: () => close() }, icon('close')));
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  }
  if (kicker) box.append(h('div', { class: 'modal-kicker' }, kicker));
  if (title) box.append(h('h2', { class: 'modal-title' }, title));
  const bodyEl = h('div', { class: 'modal-body' }, body);
  box.append(bodyEl);
  const btns = actions.map(a => {
    const b = h('button', { class: `btn ${a.kind || ''}`, disabled: a.disabled }, a.icon ? icon(a.icon) : null, a.label);
    b.addEventListener('click', async () => {
      if (a.onClick) { const r = await a.onClick(b); if (r === false) return; }
      if (a.close !== false) close();
    });
    return b;
  });
  if (btns.length) box.append(h('div', { class: 'modal-actions' }, btns));
  document.body.append(wrap);
  openModals.add(close);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    wrap.classList.add('in');
    const f = box.querySelector('[autofocus]') || box.querySelector('.modal-actions .btn.primary') || box.querySelector('input, textarea, select, button:not(.modal-x)');
    if (f) f.focus();
  });
  return { close, el: box, buttons: btns, body: bodyEl };
}

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function confirmModal({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false, kicker }) {
  return new Promise(resolve => {
    let done = false;
    modal({
      title, kicker, body,
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: cancel, kind: 'ghost', onClick: () => { done = true; resolve(false); } },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
      ],
    });
  });
}

// Scratch calculator: + - * / % and brackets, parsed by hand. No eval, so the
// site's Content Security Policy never has to allow 'unsafe-eval'.
export function calc(expr) {
  const TIMES = String.fromCharCode(215), DIVIDE = String.fromCharCode(247);
  const src = String(expr).split(TIMES).join('*').split(DIVIDE).join('/').replace(/x/gi, '*').replace(/,/g, '.');
  if (src.length > 120 || !/^[\d\s.+\-*/()%]+$/.test(src) || !/\d/.test(src)) return null;
  const tokens = src.match(/\d*\.?\d+|[+\-*/%()]/g) || [];
  let i = 0, depth = 0;
  const peek = () => tokens[i];
  const primary = () => {
    const t = tokens[i++];
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '(') {
      if (++depth > 20) throw new Error('too deep');
      const v = sum();
      if (tokens[i++] !== ')') throw new Error('bracket');
      depth--;
      return v;
    }
    const n = Number(t);
    if (t === undefined || Number.isNaN(n)) throw new Error('number');
    return n;
  };
  const product = () => {
    let v = primary();
    while (['*', '/', '%'].includes(peek())) {
      const op = tokens[i++], r = primary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  };
  const sum = () => {
    let v = product();
    while (['+', '-'].includes(peek())) { const op = tokens[i++], r = product(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  try {
    const v = sum();
    if (i !== tokens.length) return null;
    return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
  } catch { return null; }
}

export function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }
