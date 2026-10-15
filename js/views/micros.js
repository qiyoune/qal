// Onglet Micros : vitamines, minéraux et ce qu'il faut limiter
import { icons, dayLabel, addDays, dateStr, $ } from '../ui.js';
import { entriesFor, getState } from '../store.js';
import { totals, fmt, fmtSmart, NUTRIENTS, MICROS, references } from '../nutrition.js';

export function renderMicros(root, ui, nav) {
  const st = getState();
  const g = st.goals || { kcal: 2000, fiber: 30 };
  const entries = entriesFor(ui.date);
  const { t, known, count } = totals(entries);
  const ref = references(st.profile);
  ref.satfat.limit = Math.round((g.kcal * 0.1) / 9);
  ref.fiber.target = g.fiber || 30;
  const isToday = ui.date === dateStr();

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
  const cov = count ? Math.round((known.iron / count) * 100) : 0;

  root.innerHTML = `
    <header class="topbar">
      <div class="head" style="font-size:26px">micros <span class="star">✦</span></div>
      <div class="daynav">
        <button id="d-prev" aria-label="Jour précédent">${icons.back}</button>
        <div class="label">${dayLabel(ui.date)}</div>
        <button id="d-next" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>${icons.next}</button>
      </div>
    </header>

    ${count ? '' : `<div class="card section center"><p class="muted" style="margin:0">Rien de mangé ce jour-là. Ajoute des aliments depuis le journal pour voir tes vitamines et minéraux.</p></div>`}

    <h2 class="section-title">objectifs</h2>
    <div class="card section mlist">${['fiber', ...MICROS].map((k) => row(k, false)).join('')}</div>

    <h2 class="section-title">limites</h2>
    <div class="card section mlist">${['sugar', 'satfat', 'salt'].map((k) => row(k, true)).join('')}</div>

    <p class="coverage section">${count ? `Vitamines et minéraux connus pour ${cov} % de tes aliments du jour. ` : ''}Les produits scannés n'indiquent souvent que les macros sur l'étiquette : les aliments bruts de la table Ciqual sont les plus complets. Repères : ANSES et EFSA, adultes.</p>
  `;

  $('#d-prev', root).onclick = () => { ui.date = addDays(ui.date, -1); nav.render(); };
  $('#d-next', root).onclick = () => { if (!isToday) { ui.date = addDays(ui.date, 1); nav.render(); } };
}
