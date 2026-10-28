// Feuille "choisir un ingrédient" (pour les recettes)
import { esc, num, icons, openSheet, closeSheet, toast, $ } from './ui.js';
import { recentFoods, findFoodByCode } from './store.js';
import { searchCiqual, searchOFF, getProduct, norm } from './foods.js';
import { scale, fmt } from './nutrition.js';

const badge = (src) => ({ ciqual: '<span class="badge ciqual">ciqual</span>', off: '<span class="badge off">off</span>', perso: '<span class="badge perso">perso</span>', recette: '<span class="badge perso">recette</span>' }[src] || '');

export function openIngredientPicker({ onPick, query = '', cta = 'ajouter à la recette', grams: startGrams }) {
  const sheet = openSheet(`
    <h2>ajouter un ingredient</h2>
    <form class="search section" id="pk-form" autocomplete="off">
      ${icons.search}
      <input id="pk-in" type="search" enterkeyhint="search" placeholder="riz, poulet, ou un code-barres" value="${esc(query)}" />
    </form>
    <div id="pk-res" class="section"></div>`);
  const input = $('#pk-in', sheet);
  const res = $('#pk-res', sheet);
  let lists = {}; let off = { q: '', items: [], loading: false, error: false };
  let timer;

  const row = (f, i, l) => `<button class="result" data-l="${l}" data-i="${i}">
    <span class="grow"><div class="t">${esc(f.name)}</div><div class="s">${badge(f.source)}${esc(f.brand || f.group || '')}</div></span>
    <span class="k">${fmt(f.per100?.kcal)}<small>kcal/100g</small></span></button>`;

  const draw = async () => {
    const q = input.value; const nq = norm(q);
    if (!nq) { res.innerHTML = ''; return; }
    lists.mine = recentFoods(200).filter((f) => nq.split(' ').every((w) => norm(f.name + ' ' + (f.brand || '')).includes(w))).slice(0, 5);
    lists.raw = await searchCiqual(q, 15);
    lists.off = off.q === nq ? off.items : [];
    if (norm(input.value) !== nq) return;
    res.innerHTML = `
      ${lists.mine.length ? `<div class="card" style="padding:4px 16px">${lists.mine.map((f, i) => row(f, i, 'mine')).join('')}</div>` : ''}
      ${lists.off.length ? `<div class="list-title">produits du commerce</div><div class="card" style="padding:4px 16px">${lists.off.map((f, i) => row(f, i, 'off')).join('')}</div>` : off.loading ? '<p class="small muted center"><span class="loader"></span></p>' : off.error ? '<p class="small muted center">Open Food Facts limite les recherches : réessaie dans une minute.</p>' : '<p class="small muted center" style="margin:12px 0">Appuie sur Rechercher pour inclure les produits du commerce.</p>'}
      <div class="list-title">aliments bruts · ciqual</div>
      <div class="card" style="padding:4px 16px">${lists.raw.length ? lists.raw.map((f, i) => row(f, i, 'raw')).join('') : '<p class="small muted" style="margin:12px 0">Rien trouvé.</p>'}</div>`;
    res.querySelectorAll('.result').forEach((b) => (b.onclick = () => grams(lists[b.dataset.l][+b.dataset.i])));
  };

  const grams = (food) => {
    let g = startGrams || food.lastGrams || 100;
    sheet.innerHTML = `
      <h2 style="font-family:var(--font);font-weight:800;text-transform:none;font-size:22px">${esc(food.name)}</h2>
      <p class="small muted" style="margin:4px 0 0">${badge(food.source)}${esc(food.brand || '')}</p>
      <div class="qty">
        <button class="step" data-step="-10">−</button>
        <label class="qty-input"><input id="pk-g" type="text" inputmode="decimal" value="${g}" /><span>g</span></label>
        <button class="step" data-step="10">+</button>
      </div>
      <p class="per100" id="pk-kcal"></p>
      <button class="btn btn-primary section" id="pk-add">${esc(cta)}</button>`;
    const gi = $('#pk-g', sheet);
    const upd = () => { $('#pk-kcal', sheet).textContent = `${fmt(scale(food.per100, g || 0).kcal)} kcal`; };
    gi.addEventListener('input', () => { g = num(gi.value) || 0; upd(); });
    gi.addEventListener('focus', () => gi.select());
    sheet.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => { g = Math.max(0, Math.round((g || 0) + +b.dataset.step)); gi.value = g; upd(); }));
    $('#pk-add', sheet).onclick = () => {
      if (!(g > 0)) return;
      closeSheet({ silent: true });
      onPick({ name: food.name, brand: food.brand || '', grams: g, per100: food.per100, source: food.source, code: food.code || '' });
    };
    upd();
  };

  const runOFF = async () => {
    const q = input.value.trim(); if (!q) return;
    // un code-barres ?
    if (/^\d{8,14}$/.test(q)) {
      const local = findFoodByCode(q);
      if (local) return grams(local);
      try { const p = await getProduct(q); if (p && !p.incomplete) return grams(p); toast('produit introuvable'); } catch { toast('pas de connexion ?'); }
      return;
    }
    const nq = norm(q);
    off = { q: nq, items: [], loading: true, error: false }; draw();
    try { off = { q: nq, items: await searchOFF(q), loading: false, error: false }; }
    catch { off = { q: nq, items: [], loading: false, error: true }; }
    draw();
  };

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });
  $('#pk-form', sheet).onsubmit = (e) => { e.preventDefault(); input.blur(); runOFF(); };
  if (query) draw();
  setTimeout(() => input.focus(), 300);
}
