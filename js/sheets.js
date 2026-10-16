// Feuilles du bas : fiche aliment (quantité) et création d'aliment perso
import { esc, num, icons, openSheet, closeSheet, toast, $ } from './ui.js';
import { MEALS, addEntry, updateEntry, deleteEntry, saveCustomFood, isFav, toggleFav } from './store.js';
import { scale, fmt } from './nutrition.js';
import { offAddUrl } from './foods.js';

const badge = (src) => ({ ciqual: '<span class="badge ciqual">ciqual</span>', off: '<span class="badge off">open food facts</span>', perso: '<span class="badge perso">perso</span>', recette: '<span class="badge perso">recette</span>' }[src] || '');

/**
 * Fiche aliment : choisir la quantité et le repas.
 * opts: { food, grams, meal, date, entryId, onDone, onCancel }
 */
export function openFoodSheet({ food, grams, meal, date, entryId, onDone, onCancel, extra = [], extraHtml = '' }) {
  let g = grams || food.lastGrams || food.serving?.grams || 100;
  let m = meal;
  const p = food.per100 || {};

  const presets = [...new Set([
    ...(food.serving?.grams ? [food.serving.grams] : []),
    ...(food.lastGrams && food.lastGrams !== food.serving?.grams ? [food.lastGrams] : []),
    50, 100, 150, 200,
  ])].slice(0, 6);

  const html = `
    <div class="food-head">
      ${food.img ? `<img src="${esc(food.img)}" alt="" />` : `<span class="thumb" style="width:64px;height:64px;font-size:24px">✦</span>`}
      <div style="flex:1;min-width:0">
        <h2>${esc(food.name)}</h2>
        <div class="small muted" style="margin-top:4px">${badge(food.source)}${esc(food.brand || '')}${food.quantity ? ' · ' + esc(food.quantity) : ''}</div>
      </div>
      <button class="fav-btn ${isFav(food) ? 'on' : ''}" id="f-fav" aria-label="Favori" aria-pressed="${isFav(food)}">✦</button>
    </div>

    <div class="qty">
      <button class="step" data-step="-10" aria-label="Moins">−</button>
      <label class="qty-input"><input id="g-in" type="text" inputmode="decimal" value="${fmt(g, 1).replace(/\s/g, '')}" /><span>g</span></label>
      <button class="step" data-step="10" aria-label="Plus">+</button>
    </div>
    <div class="chips" style="margin-top:10px">
      ${presets.map((x) => `<button class="chip" data-g="${x}">${food.serving?.grams === x ? `1 portion · ${fmt(x)} g` : `${fmt(x)} g`}</button>`).join('')}
    </div>

    <div class="preview" id="preview"></div>
    <div class="per100">pour 100 g : ${fmt(p.kcal)} kcal · P ${fmt(p.prot, 1)} · G ${fmt(p.carb, 1)} · L ${fmt(p.fat, 1)}${p.fiber != null ? ' · fibres ' + fmt(p.fiber, 1) : ''}</div>

    ${extraHtml}
    <div class="chips meal-grid" style="margin-top:16px" id="meal-chips">
      ${MEALS.map((x) => `<button class="chip ${x.id === m ? 'on' : ''}" data-meal="${x.id}">${x.label}</button>`).join('')}
    </div>

    <div class="stack" style="margin-top:16px">
      <button class="btn btn-primary" id="f-save"></button>
      ${extra.map((x, i) => `<button class="btn ${x.cls || 'btn-ghost'}" data-extra="${i}">${esc(x.label)}</button>`).join('')}
      ${entryId ? `<button class="btn btn-danger" id="f-del">${icons.trash.replace('<svg', '<svg width="18" height="18"')} supprimer</button>` : ''}
    </div>`;

  const sheet = openSheet(html, { onClose: onCancel });
  const input = $('#g-in', sheet);
  const save = $('#f-save', sheet);

  const update = () => {
    const v = scale(p, g || 0);
    $('#preview', sheet).innerHTML = `
      <div class="kcal"><b>${fmt(v.kcal)}</b><span>kcal</span></div>
      <div><b>${fmt(v.prot, 1)}</b><span>protéines</span></div>
      <div><b>${fmt(v.carb, 1)}</b><span>glucides</span></div>
      <div><b>${fmt(v.fat, 1)}</b><span>lipides</span></div>`;
    const label = MEALS.find((x) => x.id === m)?.label;
    save.textContent = entryId ? 'enregistrer' : `ajouter au ${label}`.replace('au collation', 'à la collation');
    save.disabled = !(g > 0);
  };

  $('#f-fav', sheet).onclick = (e) => {
    const on = toggleFav(food);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.setAttribute('aria-pressed', on);
    toast(on ? 'ajouté aux favoris ✦' : 'retiré des favoris');
  };
  input.addEventListener('input', () => { g = num(input.value) || 0; update(); });
  input.addEventListener('focus', () => input.select());
  sheet.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => {
    g = Math.max(0, Math.round((g || 0) + Number(b.dataset.step)));
    input.value = g; update();
  }));
  sheet.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { g = Number(b.dataset.g); input.value = g; update(); }));
  sheet.querySelectorAll('[data-meal]').forEach((b) => (b.onclick = () => {
    m = b.dataset.meal;
    sheet.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x === b));
    update();
  }));

  save.onclick = () => {
    if (!(g > 0)) return;
    if (entryId) { updateEntry(entryId, { grams: g, meal: m }); toast('modifié ✦'); }
    else { addEntry({ date, meal: m, food, grams: g }); toast(`${fmt(scale(p, g).kcal)} kcal ajoutées ✦`); }
    closeSheet({ silent: true });
    onDone?.();
  };
  sheet.querySelectorAll('[data-extra]').forEach((b) => (b.onclick = () => { closeSheet({ silent: true }); extra[+b.dataset.extra].onClick(); }));
  $('#f-del', sheet)?.addEventListener('click', () => {
    deleteEntry(entryId);
    toast('supprimé');
    closeSheet({ silent: true });
    onDone?.();
  });
  update();
}

/** Produit introuvable après un scan */
export function openNotFoundSheet({ code, onCreate, onRetry }) {
  const sheet = openSheet(`
    <h2>produit introuvable</h2>
    <p class="muted" style="margin:8px 0 18px">Le code <b>${esc(code)}</b> n'est pas encore dans Open Food Facts. Recopie l'étiquette une fois, il sera enregistré pour la prochaine fois.</p>
    <div class="stack">
      <button class="btn btn-primary" id="nf-create">créer ce produit</button>
      <a class="btn btn-outline" href="${offAddUrl(code)}" target="_blank" rel="noopener">l'ajouter sur Open Food Facts</a>
      <button class="btn btn-ghost" id="nf-retry">rescanner</button>
    </div>`, { onClose: onRetry });
  $('#nf-create', sheet).onclick = () => { closeSheet({ silent: true }); onCreate(); };
  $('#nf-retry', sheet).onclick = () => closeSheet();
}

/** Création / édition d'un aliment perso (valeurs pour 100 g) */
export function openCustomFoodSheet({ code = '', food = null, onSaved, onCancel }) {
  const p = food?.per100 || {};
  const v = (x) => (x == null ? '' : String(x).replace('.', ','));
  const sheet = openSheet(`
    <h2>${food ? 'modifier' : 'nouvel'} aliment</h2>
    <p class="small muted" style="margin:6px 0 16px">Recopie l'étiquette, colonne <b>pour 100 g</b> (ou 100 ml).</p>
    <div class="stack">
      <div class="field"><label>Nom</label><input class="input" id="c-name" value="${esc(food?.name || '')}" placeholder="ex : Galettes de riz chocolat" /></div>
      <div class="grid2">
        <div class="field"><label>Marque</label><input class="input" id="c-brand" value="${esc(food?.brand || '')}" placeholder="optionnel" /></div>
        <div class="field"><label>Code-barres</label><input class="input" id="c-code" inputmode="numeric" value="${esc(food?.code || code)}" placeholder="optionnel" /></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Calories (kcal)</label><input class="input" id="c-kcal" inputmode="decimal" value="${v(p.kcal)}" /></div>
        <div class="field"><label>Protéines (g)</label><input class="input" id="c-prot" inputmode="decimal" value="${v(p.prot)}" /></div>
        <div class="field"><label>Glucides (g)</label><input class="input" id="c-carb" inputmode="decimal" value="${v(p.carb)}" /></div>
        <div class="field"><label>Lipides (g)</label><input class="input" id="c-fat" inputmode="decimal" value="${v(p.fat)}" /></div>
      </div>
      <div class="grid3">
        <div class="field"><label>Sucres</label><input class="input" id="c-sugar" inputmode="decimal" value="${v(p.sugar)}" /></div>
        <div class="field"><label>Fibres</label><input class="input" id="c-fiber" inputmode="decimal" value="${v(p.fiber)}" /></div>
        <div class="field"><label>Sel</label><input class="input" id="c-salt" inputmode="decimal" value="${v(p.salt)}" /></div>
      </div>
      <div class="field"><label>Une portion fait (g) — optionnel</label><input class="input" id="c-serv" inputmode="decimal" value="${v(food?.serving?.grams)}" placeholder="ex : 30" /></div>
      <button class="btn btn-primary" id="c-save" style="margin-top:6px">enregistrer</button>
    </div>`, { onClose: onCancel });

  $('#c-save', sheet).onclick = () => {
    const val = (id) => num($('#' + id, sheet).value);
    const name = $('#c-name', sheet).value.trim();
    const kcal = val('c-kcal');
    if (!name || kcal == null) { toast('il faut au moins un nom et les calories'); return; }
    const serv = val('c-serv');
    const saved = saveCustomFood({
      name, brand: $('#c-brand', sheet).value.trim(), code: $('#c-code', sheet).value.replace(/\D/g, ''),
      per100: { kcal, prot: val('c-prot'), carb: val('c-carb'), fat: val('c-fat'), sugar: val('c-sugar'), fiber: val('c-fiber'), salt: val('c-salt') },
      serving: serv ? { grams: serv, label: 'portion' } : null,
    });
    toast('aliment enregistré ✦');
    closeSheet({ silent: true });
    onSaved?.(saved);
  };
}
