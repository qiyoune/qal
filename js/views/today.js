// Écran principal : le journal du jour
import { esc, icons, dayLabel, addDays, dateStr, plain, $ } from '../ui.js';
import { MEALS, entriesFor, getState } from '../store.js';
import { totals, scale, fmt, fmtSmart, NUTRIENTS, MICROS, references } from '../nutrition.js';
import { starPath, burst } from '../fx.js';

const STAR = starPath(1, 0.4);
const HALO = starPath(1, 0.3);

export function renderToday(root, ui, nav) {
  const st = getState();
  const g = st.goals || { kcal: 2000, prot: 120, carb: 220, fat: 70, fiber: 30 };
  const entries = entriesFor(ui.date);
  const { t, known, count } = totals(entries);
  const left = Math.round(g.kcal - t.kcal);
  const pct = Math.min(1, t.kcal / g.kcal);
  const over = left < 0;
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

    <section class="hero-star section ${over ? 'over' : ''}" aria-label="${fmt(Math.abs(left))} kcal ${over ? 'au-dessus de ton objectif' : 'restantes'}">
      <div class="star-wrap">
        <svg class="halo" viewBox="-1 -1 2 2" aria-hidden="true"><path d="${HALO}"/></svg>
        <svg class="star" viewBox="-1.02 -1.02 2.04 2.04" aria-hidden="true">
          <defs>
            <clipPath id="star-clip"><path d="${STAR}"/></clipPath>
            <clipPath id="fill-clip"><path class="fill-mask" d="${STAR}" transform="scale(0)"/></clipPath>
          </defs>
          <path class="star-track" d="${STAR}"/>
          <path class="star-fill" d="${STAR}" transform="scale(0)"/>
          <text class="star-num" x="0" y="0.12" text-anchor="middle">${fmt(Math.abs(left)).replace(/\s/g, ' ')}</text>
          <g clip-path="url(#fill-clip)">
            <text class="star-num on" x="0" y="0.12" text-anchor="middle">${fmt(Math.abs(left)).replace(/\s/g, ' ')}</text>
          </g>
        </svg>
      </div>
      <div class="star-label">${over ? 'kcal au-dessus de ton objectif' : 'kcal restantes'}</div>
      <div class="star-stats">
        <div><b>${fmt(t.kcal)}</b><span>mangées</span></div>
        <div><b>${fmt(g.kcal)}</b><span>objectif</span></div>
        <div><b>${fmt(t.fiber)}<small> / ${fmt(g.fiber || 30)} g</small></b><span>fibres</span></div>
      </div>
    </section>

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

  animateFill(root, ui, pct, over);

  $('#d-prev', root).onclick = () => { ui.date = addDays(ui.date, -1); nav.render(); };
  $('#d-next', root).onclick = () => { if (!isToday) { ui.date = addDays(ui.date, 1); nav.render(); } };
  $('#go-profile', root).onclick = () => nav.go('#/profile');
  $('#toggle-micros', root).onclick = () => { ui.showMicros = !ui.showMicros; nav.render(); };
  $('#fab', root).onclick = () => nav.openAdd(null, 'scan');
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => nav.openAdd(b.dataset.add, 'search')));
  root.querySelectorAll('[data-entry]').forEach((b) => (b.onclick = () => nav.editEntry(b.dataset.entry)));
}

// L'étoile se remplit depuis son niveau précédent ; gerbe d'étoiles après un ajout
function animateFill(root, ui, pct, over) {
  const rects = root.querySelectorAll('.star-fill, .fill-mask');
  const key = ui.date;
  const from = ui.fillFrom?.date === key ? ui.fillFrom.pct : 0;
  ui.fillFrom = { date: key, pct };
  // l'étoile rouge grandit depuis le centre (surface proportionnelle aux calories)
  const set = (p) => rects.forEach((r) => r.setAttribute('transform', `scale(${Math.sqrt(Math.max(0, p)).toFixed(4)})`));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || Math.abs(pct - from) < 0.001) { set(pct); return; }
  set(from);
  const t0 = performance.now(), D = from === 0 ? 1100 : 900;
  const ease = (x) => 1 - Math.pow(1 - x, 4);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / D);
    set(from + (pct - from) * ease(k));
    if (k < 1) requestAnimationFrame(step);
    else if (ui.justAdded) {
      ui.justAdded = false;
      const b = root.querySelector('.star-wrap')?.getBoundingClientRect();
      if (b) burst(b.left + b.width / 2, b.top + b.height / 2, over ? 6 : 10);
    }
  };
  requestAnimationFrame(step);
}
