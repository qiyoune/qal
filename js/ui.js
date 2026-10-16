// Petits utilitaires d'interface
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Titres en Alstoria : comme sur qiyoune.com, sans accents (la police n'en a pas)
export const plain = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const num = (v) => {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(x) ? x : null;
};

/* ---------- Dates ---------- */
export const dateStr = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
export function dayLabel(s) {
  const today = dateStr();
  if (s === today) return "aujourd'hui";
  if (s === addDays(today, -1)) return 'hier';
  if (s === addDays(today, 1)) return 'demain';
  return parseDate(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function mealForNow() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

/* ---------- Icônes (SVG inline) ---------- */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const icons = {
  barcode: svg('<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 'stroke-width="3"'),
  flash: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
  cloud: svg('<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6 16.5"/><path d="M6 19h11.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
};
export const star = '<span class="star">✦</span>';

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function hideToast() { $('#toast').classList.remove('show'); }

/* ---------- Bottom sheet ---------- */
let onSheetClose = null;
export function openSheet(html, { onClose } = {}) {
  hideToast();
  const sheet = $('#sheet');
  const bd = $('#sheet-backdrop');
  sheet.innerHTML = html;
  sheet.hidden = false;
  bd.hidden = false;
  sheet.scrollTop = 0;
  onSheetClose = onClose || null;
  bd.onclick = () => closeSheet();
  return sheet;
}
export function closeSheet({ silent = false } = {}) {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('#sheet-backdrop').hidden = true;
  sheet.innerHTML = '';
  const cb = onSheetClose;
  onSheetClose = null;
  if (!silent) cb?.();
}
export const sheetOpen = () => !$('#sheet').hidden;

/* ---------- Décor ---------- */
export function sparkles() {
  const host = $('#sparkles');
  const pts = [[8, 14, 14], [86, 9, 10], [72, 28, 18, 1], [14, 46, 10], [92, 52, 12], [6, 78, 16, 1], [80, 84, 10], [50, 6, 8], [40, 92, 12]];
  host.innerHTML = pts.map(([x, y, s, red], i) => `<i class="${red ? 'red' : ''}" style="left:${x}%;top:${y}%;font-size:${s}px;animation-delay:${i * 0.7}s;--o:${red ? 0.22 : 0.08}">✦</i>`).join('');
}

export function splash() {
  const el = $('#splash');
  const numEl = $('#splash-num');
  const steps = $$('.splash-steps span');
  const t0 = performance.now();
  const D = 750;
  return new Promise((res) => {
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / D);
      numEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
      steps.forEach((s, i) => s.classList.toggle('on', p >= i / steps.length));
      if (p < 1) requestAnimationFrame(tick);
      else { el.classList.add('done'); setTimeout(() => el.remove(), 600); res(); }
    };
    requestAnimationFrame(tick);
  });
}
