// Effets visuels : l'étoile ✦ comme fil conducteur
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Chemin d'une étoile ✦ à 4 branches courbes (centre cx,cy, rayon r).
// k = rayon du "creux" sur les diagonales (0.354 = losange, plus petit = plus fin)
export function starPath(r = 1, k = 0.34, cx = 0, cy = 0) {
  const c = 2 * (k - 0.3536); // point de contrôle qui donne ce creux
  const tip = (i) => { const a = (Math.PI / 2) * i - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ctl = (i) => { const a = (Math.PI / 2) * i - Math.PI / 4; return [cx + Math.cos(a) * c * r, cy + Math.sin(a) * c * r]; };
  const f = ([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`;
  let d = `M${f(tip(0))}`;
  for (let i = 0; i < 4; i++) d += ` Q${f(ctl(i))} ${f(tip(i + 1))}`;
  return d + 'Z';
}

/* ---------- Dernier point touché (origine des transitions) ---------- */
let lastPt = null;
window.addEventListener('pointerdown', (e) => { lastPt = { x: e.clientX, y: e.clientY, t: Date.now() }; }, { capture: true, passive: true });
const origin = () => (lastPt && Date.now() - lastPt.t < 1500 ? lastPt : { x: innerWidth / 2, y: innerHeight / 2 });

/* ---------- Transition : une étoile couvre l'écran puis révèle le suivant ---------- */
let wiping = false;
export async function starWipe(swap, from = null) {
  if (reduce() || wiping) { swap(); return; }
  wiping = true;
  const { x, y } = from || origin();
  const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const R = far / 0.31; // le creux de l'étoile doit couvrir tout l'écran
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '-1 -1 2 2');
  el.setAttribute('class', 'wipe');
  el.style.cssText = `left:${x - R}px;top:${y - R}px;width:${R * 2}px;height:${R * 2}px`;
  el.innerHTML = `<path d="${starPath(1, 0.33)}" />`;
  document.body.appendChild(el);
  try {
    await el.animate(
      [{ transform: 'scale(0.002) rotate(-45deg)' }, { transform: 'scale(1) rotate(0deg)' }],
      { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }
    ).finished;
    swap();
    // l'étoile a la couleur du fond de l'écran suivant : elle se fond dedans
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished;
  } finally {
    el.remove();
    wiping = false;
  }
}

/* ---------- Gerbe d'étoiles ---------- */
export function burst(x, y, n = 9) {
  if (reduce()) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.textContent = '✦';
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = 70 + Math.random() * 70;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.fontSize = 10 + Math.random() * 14 + 'px';
    if (i % 3 === 0) s.style.color = 'var(--ink)';
    document.body.appendChild(s);
    s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0) rotate(0)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(${90 + Math.random() * 90}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.15}px), calc(-50% + ${Math.sin(a) * d * 1.15 + 20}px)) scale(.4) rotate(180deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.16,1,.3,1)' }
    ).finished.then(() => s.remove());
  }
}

/* ---------- Thème clair / sombre + ambiance selon l'heure ---------- */
// Thème : 'auto' (suit le réglage de l'iPhone), 'light' ou 'dark'. Mémorisé sur l'appareil.
const THEME_KEY = 'qal:theme';
export function getThemePref() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
}
export function setThemePref(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch {}
  applyPeriod();
}
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
darkMQ.addEventListener?.('change', () => applyPeriod());

// En thème clair, la teinte du fond suit le moment de la journée
export function periodNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 6 && h < 11) return 'matin';
  if (h >= 11 && h < 17.5) return 'jour';
  return 'soir';
}
const THEME_COLOR = { matin: '#F4EFE9', jour: '#F2F1F0', soir: '#EFE0D9', dark: '#1C1715' };
export function applyPeriod() {
  const pref = getThemePref();
  const theme = pref === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : pref;
  const p = periodNow();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.period = p;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? THEME_COLOR.dark : THEME_COLOR[p]);
}

/* ---------- Grandes étoiles qui dérivent au fond ---------- */
export function bigStars() {
  const host = document.getElementById('sparkles');
  const big = [
    { x: 78, y: 12, s: 260, cls: 'a' },
    { x: -12, y: 58, s: 340, cls: 'b' },
    { x: 70, y: 88, s: 180, cls: 'c' },
  ];
  host.insertAdjacentHTML('afterbegin', big.map((b) => `
    <svg class="big-star ${b.cls}" viewBox="-1 -1 2 2" style="left:${b.x}%;top:${b.y}%;width:${b.s}px;height:${b.s}px"><path d="${starPath(1, 0.3)}"/></svg>`).join(''));
}
