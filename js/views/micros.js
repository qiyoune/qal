// Onglet Micros : moyenne de tes vitamines et minéraux sur les 100 derniers jours
// (seulement les jours où tu as enregistré des aliments), ou le détail d'un jour.
import { icons, dayLabel, addDays, dateStr, parseDate, $ } from '../ui.js';
import { entriesFor, getState } from '../store.js';
import { totals, fmt, fmtSmart, NUTRIENTS, MICROS, references } from '../nutrition.js';

const WINDOW = 100;

// Moyenne par jour suivi : pour chaque nutriment, on additionne la journée puis on fait la moyenne des journées
function average() {
  const st = getState();
  const today = dateStr();
  const from = addDays(today, -(WINDOW - 1));
  const days = [...new Set(Object.values(st.entries).filter((e) => !e.deleted && e.date >= from && e.date <= today).map((e) => e.date))].sort();
  const sum = {}; const knownDays = {}; let entriesCount = 0; let entriesKnownIron = 0;
  for (const k of Object.keys(NUTRIENTS)) { sum[k] = 0; knownDays[k] = 0; }
  for (const d of days) {
    const { t, known, count } = totals(entriesFor(d));
    entriesCount += count; entriesKnownIron += known.iron;
    for (const k of Object.keys(NUTRIENTS)) if (known[k]) { sum[k] += t[k]; knownDays[k] += 1; }
  }
  const avg = {};
  for (const k of Object.keys(NUTRIENTS)) avg[k] = knownDays[k] ? sum[k] / knownDays[k] : 0;
  return { t: avg, known: knownDays, count: days.length, days, cov: entriesCount ? Math.round((entriesKnownIron / entriesCount) * 100) : 0 };
}

export function renderMicros(root, ui, nav) {
  const st = getState();
  const g = st.goals || { kcal: 2000, fiber: 30 };
  const mode = ui.microsMode || 'avg';
  const ref = references(st.profile);
  ref.satfat.limit = Math.round((g.kcal * 0.1) / 9);
  ref.fiber.target = g.fiber || 30;
  const isToday = ui.date === dateStr();

  let data;
  if (mode === 'avg') data = average();
  else {
    const r = totals(entriesFor(ui.date));
    data = { t: r.t, known: r.known, count: r.count, cov: r.count ? Math.round((r.known.iron / r.count) * 100) : 0 };
  }
  const { t, known, count } = data;

  const row = (k, limit) => {
    const r = ref[k];
    const target = limit ? r.limit : r.target;
    const p = target ? t[k] / target : 0;
    const unknown = count && known[k] === 0;
    const state = limit ? (p > 1 ? 'trop' : '') : p >= 1 ? 'ok' : '';
    return `<div class="mrow ${state}">
      <div class="mtop"><span class="mname">${NUTRIENTS[k].label}</span>
        <span class="mval">${unknown ? '<span class="muted">inconnu</span>' : `<b>${fmtSmart(t[k])}</b> ${limit ? '/ max' : '/'} ${fmt(target, 1)} ${NUTRIENTS[k].unit}`}</span></div>
      <div class="bar-track"><div class="bar-fill ${limit ? 'limit' : ''} ${limit && p > 1 ? 'over' : ''}" style="width:${Math.min(100, p * 100)}%"></div></div>
    </div>`;
  };

  let summary = '';
  if (mode === 'avg') {
    const since = data.days.length ? parseDate(data.days[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
    summary = count
      ? `<p class="micro-summary">Moyenne par jour sur <b>${count} jour${count > 1 ? 's' : ''} suivi${count > 1 ? 's' : ''}</b>${count > 1 ? ` depuis le ${since}` : ''}. Les jours sans aliment enregistré ne comptent pas.</p>`
      : `<div class="card section center"><p class="muted" style="margin:0">Aucun jour suivi sur les 100 derniers jours. Ajoute des aliments depuis le journal pour voir ta moyenne.</p></div>`;
  } else if (!count) {
    summary = `<div class="card section center"><p class="muted" style="margin:0">Rien de mangé ce jour-là.</p></div>`;
  }

  root.innerHTML = `
    <header class="topbar">
      <div class="head" style="font-size:26px">micros <span class="star">✦</span></div>
      ${mode === 'day' ? `<div class="daynav">
        <button id="d-prev" aria-label="Jour précédent">${icons.back}</button>
        <div class="label">${dayLabel(ui.date)}</div>
        <button id="d-next" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>${icons.next}</button>
      </div>` : '<span></span>'}
    </header>

    <div class="segmented section" style="grid-template-columns:1fr 1fr" role="radiogroup" aria-label="Période">
      <button role="radio" aria-checked="${mode === 'avg'}" class="${mode === 'avg' ? 'on' : ''}" data-mode="avg">moyenne 100 jours</button>
      <button role="radio" aria-checked="${mode === 'day'}" class="${mode === 'day' ? 'on' : ''}" data-mode="day">un jour</button>
    </div>

    ${summary}

    <h2 class="section-title">objectifs</h2>
    <div class="card section mlist">${['fiber', ...MICROS].map((k) => row(k, false)).join('')}</div>

    <h2 class="section-title">limites</h2>
    <div class="card section mlist">${['sugar', 'satfat', 'salt'].map((k) => row(k, true)).join('')}</div>

    <p class="coverage section">${count ? `Vitamines et minéraux connus pour ${data.cov} % de tes aliments. ` : ''}Les produits scannés n'indiquent souvent que les macros sur l'étiquette : les aliments bruts de la table Ciqual sont les plus complets. Repères : ANSES et EFSA, adultes.</p>
  `;

  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { ui.microsMode = b.dataset.mode; nav.render(); }));
  $('#d-prev', root)?.addEventListener('click', () => { ui.date = addDays(ui.date, -1); nav.render(); });
  $('#d-next', root)?.addEventListener('click', () => { if (!isToday) { ui.date = addDays(ui.date, 1); nav.render(); } });
}
