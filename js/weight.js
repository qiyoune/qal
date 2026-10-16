// Suivi du poids : carte du journal + feuille avec courbe et dépense réelle
import { esc, num, openSheet, closeSheet, toast, dateStr, parseDate, addDays, $ } from './ui.js';
import { getState, setWeight, deleteWeight, weightsList, setGoals, entriesFor } from './store.js';
import { movingAvg, adaptiveEstimate, goalsFromTdee, totals, fmt } from './nutrition.js';

const kg = (v) => (v == null ? '–' : String(Math.round(v * 10) / 10).replace('.', ','));

function trend() {
  const list = weightsList();
  if (!list.length) return { list, last: null };
  const ma = movingAvg(list);
  const last = list[list.length - 1];
  const avgNow = ma[ma.length - 1].avg;
  // tendance d'il y a ~7 jours
  const weekAgo = addDays(last.date, -7);
  const prev = [...ma].reverse().find((m) => m.date <= weekAgo);
  return { list, ma, last, avgNow, diff: prev ? avgNow - prev.avg : null };
}

function spark(points, w = 120, h = 40) {
  if (points.length < 2) return '';
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys), max = Math.max(...ys), r = max - min || 1;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 4 - ((p.y - min) / r) * (h - 8)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="w-spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function weightCardHtml() {
  const t = trend();
  if (!t.last) {
    return `<button class="card section weight-card" id="w-card">
      <div><div class="w-label">poids</div><div class="w-empty">Note ton poids pour suivre ta tendance</div></div>
      <span class="add-pill">+ peser</span>
    </button>`;
  }
  const recent = t.ma.slice(-30).map((m) => ({ y: m.avg }));
  const d = t.diff;
  return `<button class="card section weight-card" id="w-card">
    <div>
      <div class="w-label">poids · tendance 7 j</div>
      <div class="w-val">${kg(t.avgNow)}<small> kg</small></div>
      <div class="w-sub">${d == null ? `dernière pesée ${kg(t.last.kg)} kg` : `${d > 0 ? '+' : ''}${kg(d)} kg en 7 jours`}</div>
    </div>
    <div class="w-right">${spark(recent)}<span class="add-pill">+ peser</span></div>
  </button>`;
}

function chart(list, ma) {
  const W = 340, H = 170, P = 26;
  const pts = list.slice(-90);
  if (pts.length < 2) return '<p class="small muted center" style="margin:18px 0">La courbe apparaît dès la 2e pesée.</p>';
  const avg = ma.slice(-90);
  const t0 = parseDate(pts[0].date).getTime(), t1 = parseDate(pts[pts.length - 1].date).getTime();
  const all = [...pts.map((p) => p.kg), ...avg.map((a) => a.avg)];
  const min = Math.floor(Math.min(...all) - 0.5), max = Math.ceil(Math.max(...all) + 0.5);
  const x = (d) => P + ((parseDate(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - P - 8);
  const y = (v) => 8 + (1 - (v - min) / (max - min)) * (H - 30);
  const grid = [min, (min + max) / 2, max].map((v) => `<line x1="${P}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="2" y="${y(v) + 4}" class="axis">${kg(v)}</text>`).join('');
  const dots = pts.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.kg)}" r="2.6" class="dot"/>`).join('');
  const line = avg.map((a) => `${x(a.date)},${y(a.avg)}`).join(' ');
  const fd = (d) => parseDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<svg viewBox="0 0 ${W} ${H}" class="w-chart" role="img" aria-label="Courbe du poids">
    ${grid}
    ${dots}
    <polyline points="${line}" class="avg"/>
    <text x="${P}" y="${H - 4}" class="axis">${fd(pts[0].date)}</text>
    <text x="${W - 8}" y="${H - 4}" class="axis" text-anchor="end">${fd(pts[pts.length - 1].date)}</text>
  </svg>
  <div class="w-legend"><span><i class="dot"></i>pesées</span><span><i class="line"></i>moyenne 7 jours</span></div>`;
}

export function openWeightSheet({ onChange } = {}) {
  const today = dateStr();
  const t = trend();
  const st = getState();
  const todayW = st.weights?.[today];

  // dépense réelle estimée
  const dailyKcal = {};
  for (let i = 0; i < 21; i++) {
    const d = addDays(today, -i);
    const e = entriesFor(d);
    if (e.length) dailyKcal[d] = totals(e).t.kcal;
  }
  const est = adaptiveEstimate(t.list, dailyKcal, today);
  const g = st.goals || {};
  const proposal = est.ready && st.profile ? goalsFromTdee(est.tdee, st.profile, g) : null;

  const sheet = openSheet(`
    <h2>poids</h2>
    <div class="qty" style="margin-top:12px">
      <button class="step" data-step="-0.1" aria-label="Moins">−</button>
      <label class="qty-input"><input id="w-in" type="text" inputmode="decimal" value="${kg(todayW?.kg ?? t.last?.kg ?? st.profile?.weight ?? '')}" /><span>kg</span></label>
      <button class="step" data-step="0.1" aria-label="Plus">+</button>
    </div>
    <button class="btn btn-primary" id="w-save" style="margin-top:12px">${todayW ? 'modifier la pesée du jour' : "enregistrer aujourd'hui"}</button>
    <p class="small muted center" style="margin:8px 0 0">Le matin, à jeun, après être allé aux toilettes : c'est le plus comparable.</p>

    <div class="card section">${t.list.length ? chart(t.list, t.ma) : '<p class="small muted center" style="margin:6px 0">Aucune pesée pour l\'instant.</p>'}</div>

    <div class="card section">
      <b>Ta dépense réelle</b>
      ${est.ready ? `
        <p class="small" style="margin:6px 0 0">Sur 3 semaines, tu as mangé en moyenne <b>${fmt(est.intake)} kcal</b> et ton poids a évolué de <b>${est.kgPerWeek > 0 ? '+' : ''}${kg(est.kgPerWeek)} kg / semaine</b>. Ta dépense réelle est donc d'environ <b>${fmt(est.tdee)} kcal / jour</b>.</p>
        ${proposal && Math.abs(proposal.kcal - g.kcal) >= 50 ? `
          <p class="small" style="margin:8px 0 0">Objectif conseillé : <b>${fmt(proposal.kcal)} kcal</b> (au lieu de ${fmt(g.kcal)}).</p>
          <button class="btn btn-outline btn-sm" id="w-apply" style="margin-top:10px;width:100%">ajuster mon objectif à ${fmt(proposal.kcal)} kcal</button>`
          : '<p class="small muted" style="margin:8px 0 0">Ton objectif actuel colle déjà à ta dépense réelle ✓</p>'}`
        : `<p class="small muted" style="margin:6px 0 0">Pèse-toi régulièrement (au moins 6 fois sur 2 semaines) et note tes repas au moins 10 jours : l'appli calculera ta vraie dépense et pourra ajuster ton objectif. Pour l'instant : ${est.weighIns} pesée${est.weighIns > 1 ? 's' : ''}, ${est.loggedDays} jour${est.loggedDays > 1 ? 's' : ''} notés sur 3 semaines.</p>`}
    </div>

    ${t.list.length ? `<div class="list-title section">dernières pesées</div>
    <div class="card" style="padding:4px 16px">${t.list.slice(-8).reverse().map((w) => `
      <div class="item"><span class="grow"><div class="t">${kg(w.kg)} kg</div><div class="s">${esc(parseDate(w.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }))}</div></span>
      <button class="icon-btn" data-wdel="${w.date}" aria-label="Supprimer" style="width:34px;height:34px">×</button></div>`).join('')}</div>` : ''}
  `);

  const input = $('#w-in', sheet);
  input.addEventListener('focus', () => input.select());
  sheet.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => {
    const v = (num(input.value) || 0) + +b.dataset.step;
    input.value = kg(Math.max(20, v));
  }));
  $('#w-save', sheet).onclick = () => {
    const v = num(input.value);
    if (!v || v < 25 || v > 400) return toast('poids invalide');
    setWeight(today, v);
    toast('pesée enregistrée ✦');
    closeSheet({ silent: true });
    onChange?.();
  };
  $('#w-apply', sheet)?.addEventListener('click', () => {
    setGoals(proposal);
    toast(`objectif ajusté à ${fmt(proposal.kcal)} kcal ✦`);
    closeSheet({ silent: true });
    onChange?.();
  });
  sheet.querySelectorAll('[data-wdel]').forEach((b) => (b.onclick = () => {
    deleteWeight(b.dataset.wdel);
    closeSheet({ silent: true });
    onChange?.();
    openWeightSheet({ onChange });
  }));
}
