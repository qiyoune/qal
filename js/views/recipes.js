// Onglet Recettes : liste, création / modification, ajout au journal
import { esc, icons, num, toast, mealForNow, dateStr, $ } from '../ui.js';
import { listRecipes, getRecipe, saveRecipe, deleteRecipe, recipeAsFood } from '../store.js';
import { scale, fmt } from '../nutrition.js';
import { openIngredientPicker } from '../picker.js';
import { openFoodSheet } from '../sheets.js';

/* ---------- Liste ---------- */
export function renderRecipes(root, ui, nav) {
  const items = listRecipes();
  root.innerHTML = `
    <header class="topbar">
      <div class="head" style="font-size:26px">recettes <span class="star">✦</span></div>
      <button class="icon-btn" id="r-new" aria-label="Nouvelle recette">${icons.plus}</button>
    </header>
    ${items.length ? `<div class="recipe-grid section">${items.map((r) => {
      const f = recipeAsFood(r);
      const portion = scale(f.per100, f.serving.grams);
      return `<button class="recipe-card" data-id="${r.id}">
        <span class="rc-star">✦</span>
        <span class="rc-name">${esc(r.name)}</span>
        <span class="rc-kcal"><b>${fmt(portion.kcal)}</b> kcal / portion</span>
        <span class="rc-macros">P ${fmt(portion.prot)} · G ${fmt(portion.carb)} · L ${fmt(portion.fat)}</span>
      </button>`;
    }).join('')}</div>` : `
      <div class="empty-state section">
        <div class="chat-big">✦</div>
        <h2>tes recettes</h2>
        <p class="muted">Enregistre tes plats faits maison une fois : ingrédients, nombre de portions, et ils s'ajoutent ensuite au journal en un tap.</p>
        <button class="btn btn-primary" id="r-new2">créer ma première recette</button>
      </div>`}
  `;
  const create = () => { ui.recipeDraft = { name: '', portions: 1, ingredients: [], preparation: '' }; nav.go('#/recipe'); };
  $('#r-new', root).onclick = create;
  $('#r-new2', root)?.addEventListener('click', create);
  root.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openRecipe(b.dataset.id, ui, nav)));
}

/* ---------- Fiche recette : ajouter au journal / modifier / supprimer ---------- */
function openRecipe(id, ui, nav) {
  const r = getRecipe(id);
  if (!r) return;
  const food = recipeAsFood(r);
  openFoodSheet({
    food: { ...food, quantity: `1 portion = ${fmt(food.serving.grams)} g${r.portions > 1 ? ` · la recette en fait ${r.portions}` : ''}` },
    grams: food.serving.grams,
    meal: ui.date === dateStr() ? mealForNow() : 'lunch',
    date: ui.date,
    onDone: () => { ui.justAdded = true; nav.go('#/'); },
    extraHtml: r.preparation ? `<div class="prep-block"><div class="about-label" style="margin-top:0">Préparation</div><p>${esc(r.preparation).replace(/\n/g, '<br>')}</p></div>` : '',
    extra: [
      { label: 'modifier la recette', cls: 'btn-ghost', onClick: () => { ui.recipeDraft = JSON.parse(JSON.stringify(r)); nav.go('#/recipe'); } },
      { label: 'supprimer', cls: 'btn-danger', onClick: () => { if (confirm(`Supprimer « ${r.name} » ?`)) { deleteRecipe(id); toast('recette supprimée'); nav.render(); } } },
    ],
  });
}

/* ---------- Éditeur ---------- */
export function renderRecipeEditor(root, ui, nav) {
  const d = ui.recipeDraft || (ui.recipeDraft = { name: '', portions: 1, ingredients: [], preparation: '' });
  const draw = () => {
    const has = d.ingredients.length > 0;
    const food = recipeAsFood({ ...d, ingredients: has ? d.ingredients : [{ grams: 0, per100: {} }] });
    const per = scale(food.per100, food.serving.grams);
    const tot = scale(food.per100, food.totalGrams);
    const n = Math.max(1, +d.portions || 1);
    root.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" id="e-back" aria-label="Retour">${icons.back}</button>
        <div class="head" style="font-size:24px">${d.id ? 'modifier' : 'nouvelle recette'}</div>
        <span style="width:42px"></span>
      </header>

      <div class="field section"><label>Nom de la recette</label><input class="input" id="e-name" value="${esc(d.name)}" placeholder="ex : bowl poulet riz brocolis" maxlength="60" /></div>

      <div class="card section portion-card">
        <div class="portion-head">
          <span class="portion-title">1 portion</span>
          <span class="portion-weight">${has ? fmt(food.serving.grams) + ' g' : '–'}</span>
        </div>
        <div class="portion-kcal"><b>${has ? fmt(per.kcal) : '0'}</b> kcal</div>
        <div class="portion-macros">
          <div><b>${has ? fmt(per.prot) : 0} g</b><span>protéines</span></div>
          <div><b>${has ? fmt(per.carb) : 0} g</b><span>glucides</span></div>
          <div><b>${has ? fmt(per.fat) : 0} g</b><span>lipides</span></div>
        </div>
        <div class="portion-split">
          <span>La recette donne</span>
          <div class="mini-step">
            <button data-p="-1" aria-label="Une portion de moins">−</button>
            <b>${n}</b>
            <button data-p="1" aria-label="Une portion de plus">+</button>
          </div>
          <span>portion${n > 1 ? 's' : ''}</span>
        </div>
        ${has && n > 1 ? `<p class="small muted" style="margin:8px 0 0">Recette entière : ${fmt(food.totalGrams)} g · ${fmt(tot.kcal)} kcal</p>` : ''}
      </div>

      <div class="list-title section"><span>ingrédients</span><span>${has ? fmt(food.totalGrams) + ' g' : ''}</span></div>
      <div class="card" style="padding:4px 16px">
        ${has ? d.ingredients.map((i, idx) => `
          <div class="item">
            <span class="grow"><div class="t">${esc(i.name)}</div><div class="s">${fmt(i.grams)} g · ${fmt(scale(i.per100, i.grams).kcal)} kcal</div></span>
            <button class="icon-btn" data-del="${idx}" aria-label="Retirer" style="width:34px;height:34px">${icons.close}</button>
          </div>`).join('') : '<p class="small muted" style="margin:14px 0">Aucun ingrédient pour l\'instant.</p>'}
      </div>
      <button class="btn btn-outline section" id="e-add">${icons.plus.replace('<svg', '<svg width="18" height="18"')} ajouter un ingrédient</button>

      <div class="about-label section">Préparation</div>
      <div class="long-input compact"><textarea id="e-prep" maxlength="3000" rows="6" placeholder="Les étapes : cuire le riz 10 min, griller le poulet, ajouter les brocolis vapeur…">${esc(d.preparation || '')}</textarea><span class="count" id="e-prep-count">${(d.preparation || '').length} / 3000</span></div>

      <button class="btn btn-primary section" id="e-save" ${d.name.trim() && has ? '' : 'disabled'}>enregistrer la recette</button>
    `;
    const nameIn = $('#e-name', root), save = $('#e-save', root), prep = $('#e-prep', root);
    const canSave = () => { save.disabled = !(d.name.trim() && d.ingredients.length); };
    nameIn.addEventListener('input', () => { d.name = nameIn.value; canSave(); });
    prep.addEventListener('input', () => { d.preparation = prep.value; $('#e-prep-count', root).textContent = `${prep.value.length} / 3000`; });
    root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { d.portions = Math.max(1, Math.min(50, n + +b.dataset.p)); draw(); }));
    root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { d.ingredients.splice(+b.dataset.del, 1); draw(); }));
    $('#e-add', root).onclick = () => openIngredientPicker({ onPick: (ing) => { d.ingredients.push(ing); draw(); } });
    $('#e-back', root).onclick = () => nav.go('#/recipes');
    save.onclick = () => {
      d.name = nameIn.value.trim();
      d.preparation = prep.value.trim();
      if (!d.name || !d.ingredients.length) return;
      saveRecipe({ ...d, portions: n });
      ui.recipeDraft = null;
      toast('recette enregistrée ✦');
      nav.go('#/recipes');
    };
  };
  draw();
}
