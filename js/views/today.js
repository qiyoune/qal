// Écran principal : le journal du jour
import { esc, icons, dayLabel, addDays, dateStr, plain, $ } from '../ui.js';
import { MEALS, entriesFor, getState } from '../store.js';
import { totals, scale, fmt, fmtSmart, NUTRIENTS, MICROS, references } from '../nutrition.js';

export function renderToday(root, ui, nav) {
  const st = getState();
  const g = st.goals || { kcal: 2000, prot: 120, carb: 220, fat: 70, fiber: 30 };
  const entries = entriesFor(ui.date);
  const { t, known, count } = totals(entries);
  const left = Math.round(g.kcal - t.kcal);
  const pct = Math.min(1, t.kcal / g.kcal);
  const R = 58, C = 2 * Math.PI * R;
  const isToday = ui.date === dateStr();

  const macro = (k, cls, label) => {
    const p = g[k] ? t[k] / g[k] : 0;
    return `<div class="macro"><div class="name">${label}</div><div class="val">${fmt(t[k])}<small> / ${fmt(g[k])} g</small></div><div class="bar-track"><div class="bar-fill ${cls} ${p > 1.08 ? 'over' : ''}" style="width:${Math.min(100, p * 100)}%"></div></div></div>`;
  };

  const meals = MEALS.map((m) => {
    const items = entries.filter((e) => e.meal === m.id);
    const kcal = items.reduce((s, e) => s + (scale(e.per100, e.grams).kcal || 0), 0);
    return `
      <div class="card meal section">
        <div class="meal-head">
          <div><div class="meal-title">${plain(m.label)}</div>${items.length ? `<div class="meal-kcal">${fmt(kcal)} kcal</div>` : ''}</div>
          <button class="add-pill" data-add="${m.id}">${icons.plus.replace('<svg', '<svg width="14" height="14"')} ajouter</button>
        </div>
        ${items.length ? items.map((e) => {
          const v = scale(e.per100, e.grams);
          return `<button class="item" data-entry="${e.id}">
            ${e.img ? `<img class="thumb" src="${esc(e.img)}" alt="" loading="lazy" />` : `<span class="thumb">✦</span>`}
            <span class="grow"><div class="t">${esc(e.name)}</div><div class="s">${fmt(e.grams)} g${e.brand ? ' · ' + esc(e.brand) : ''} · P ${fmt(v.prot)} · G ${fmt(v.carb)} · L ${fmt(v.fat)}</div></span>
            <span class="k">${fmt(v.kcal)}</span>
          </button>`;
        }).join('') : `<div class="empty-meal">Rien pour l'instant.</div>`}
      </div>`;
  }).join('');

  // Micronutriments
  const ref = references(st.profile);
  ref.satfat.limit = Math.round((g.kcal * 0.1) / 9);
  const microRow = (k, isLimit) => {
    const r = ref[k]; const target = isLimit ? r.limit : r.target;
    const p = target ? t[k] / target : 0;
    return `<div class="micro ${isLimit ? 'limit' : ''}"><div class="top"><span>${NUTRIENTS[k].label}</span><span>${fmtSmart(t[k])}${isLimit ? ' / max ' : ' / '}${fmt(target)} ${NUTRIENTS[k].unit}</span></div><div class="bar-track"><div class="bar-fill ${isLimit && p > 1 ? 'over' : ''}" style="width:${Math.min(100, p * 100)}%"></div></div></div>`;
  };
  const microCov = count ? Math.round((known.iron / count) * 100) : 0;

  root.innerHTML = `
    <header class="topbar">
      <div class="logo">qal ${'<span class="star">✦</span>'}</div>
      <div class="daynav">
        <button id="d-prev" aria-label="Jour précédent">${icons.back}</button>
        <div class="label" id="d-label">${dayLabel(ui.date)}</div>
        <button id="d-next" aria-label="Jour suivant" ${isToday ? 'disabled' : ''}>${icons.next}</button>
      </div>
      <button class="icon-btn" id="go-profile" aria-label="Profil">${icons.user}</button>
    </header>

    <div class="card hero section">
      <div class="ring ${left < 0 ? 'over' : ''}">
        <svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="${R}" fill="none" stroke-width="11"/><circle class="bar" cx="66" cy="66" r="${R}" fill="none" stroke-width="11" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <div class="ring-center"><div class="big">${fmt(Math.abs(left))}</div><div class="lbl">${left >= 0 ? 'kcal<br>restantes' : 'kcal<br>au-dessus'}</div></div>
      </div>
      <div class="hero-stats">
        <div><div class="stat-line"><span>objectif</span><b>${fmt(g.kcal)}</b></div></div>
        <div><div class="stat-line"><span>mangé</span><b>${fmt(t.kcal)}</b></div></div>
        <div><div class="stat-line"><span>fibres</span><b>${fmt(t.fiber)} / ${fmt(g.fiber || 30)} g</b></div></div>
      </div>
    </div>

    <div class="macros">
      ${macro('prot', '', 'protéines')}
      ${macro('carb', 'carb', 'glucides')}
      ${macro('fat', 'fat', 'lipides')}
    </div>

    ${meals}

    <div class="section center" style="margin-top:22px">
      <button class="pill-label" id="toggle-micros">✦ ${ui.showMicros ? 'masquer' : 'voir'} les détails ✦</button>
    </div>
    ${ui.showMicros ? `
      <div class="card section">
        <div class="micro-grid">
          ${microRow('sugar', true)}${microRow('satfat', true)}${microRow('salt', true)}${microRow('fiber', false)}
        </div>
        <div style="height:18px"></div>
        <div class="micro-grid">${MICROS.map((k) => microRow(k, false)).join('')}</div>
        <div class="coverage">${count ? `Vitamines et minéraux connus pour ${microCov} % de tes aliments du jour. Les produits scannés n'indiquent souvent que les macros : les aliments bruts (Ciqual) sont les plus complets.` : 'Ajoute des aliments pour voir le détail.'}</div>
      </div>` : ''}

    <button class="fab" id="fab">${icons.barcode} scanner</button>
  `;

  $('#d-prev', root).onclick = () => { ui.date = addDays(ui.date, -1); nav.render(); };
  $('#d-next', root).onclick = () => { if (!isToday) { ui.date = addDays(ui.date, 1); nav.render(); } };
  $('#go-profile', root).onclick = () => nav.go('#/profile');
  $('#toggle-micros', root).onclick = () => { ui.showMicros = !ui.showMicros; nav.render(); };
  $('#fab', root).onclick = () => nav.openAdd(null, 'scan');
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => nav.openAdd(b.dataset.add, 'search')));
  root.querySelectorAll('[data-entry]').forEach((b) => (b.onclick = () => nav.editEntry(b.dataset.entry)));
}
