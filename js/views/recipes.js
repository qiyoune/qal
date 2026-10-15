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
  const create = () => { ui.recipeDraft = { name: '', portions: 2, ingredients: [] }; nav.go('#/recipe'); };
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
    food: { ...food, quantity: `${r.portions} portion${r.portions > 1 ? 's' : ''} · ${fmt(food.totalGrams)} g au total` },
    grams: food.serving.grams,
    meal: ui.date === dateStr() ? mealForNow() : 'lunch',
    date: ui.date,
    onDone: () => { ui.justAdded = true; nav.go('#/'); },
    extra: [
      { label: 'modifier la recette', cls: 'btn-ghost', onClick: () => { ui.recipeDraft = JSON.parse(JSON.stringify(r)); nav.go('#/recipe'); } },
      { label: 'supprimer', cls: 'btn-danger', onClick: () => { if (confirm(`Supprimer « ${r.name} » ?`)) { deleteRecipe(id); toast('recette supprimée'); nav.render(); } } },
    ],
  });
}

/* ---------- Éditeur ---------- */
export function renderRecipeEditor(root, ui, nav) {
  const d = ui.recipeDraft || (ui.recipeDraft = { name: '', portions: 2, ingredients: [] });
  const draw = () => {
    const food = recipeAsFood({ ...d, ingredients: d.ingredients.length ? d.ingredients : [{ grams: 0, per100: {} }] });
    const tot = scale(food.per100, food.totalGrams);
    const per = scale(food.per100, food.serving.grams);
    root.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" id="e-back" aria-label="Retour">${icons.back}</button>
        <div class="head" style="font-size:24px">${d.id ? 'modifier' : 'nouvelle recette'}</div>
        <span style="width:42px"></span>
      </header>
      <div class="stack section">
        <div class="field"><label>Nom de la recette</label><input class="input" id="e-name" value="${esc(d.name)}" placeholder="ex : bowl poulet riz brocolis" maxlength="60" /></div>
        <div class="field"><label>Nombre de portions</label>
          <div class="row" style="align-items:center">
            <button class="step" style="height:52px;flex:none" data-p="-1">−</button>
            <input class="input" id="e-portions" inputmode="numeric" value="${d.portions}" style="text-align:center;font-weight:800;font-size:20px" />
            <button class="step" style="height:52px;flex:none" data-p="1">+</button>
          </div>
        </div>
      </div>
      <div class="list-title section"><span>ingrédients</span><span>${fmt(food.totalGrams && d.ingredients.length ? food.totalGrams : 0)} g</span></div>
      <div class="card" style="padding:4px 16px">
        ${d.ingredients.length ? d.ingredients.map((i, idx) => `
          <div class="item">
            <span class="grow"><div class="t">${esc(i.name)}</div><div class="s">${fmt(i.grams)} g · ${fmt(scale(i.per100, i.grams).kcal)} kcal</div></span>
            <button class="icon-btn" data-del="${idx}" aria-label="Retirer" style="width:34px;height:34px">${icons.close}</button>
          </div>`).join('') : '<p class="small muted" style="margin:14px 0">Aucun ingrédient pour l\'instant.</p>'}
      </div>
      <button class="btn btn-outline section" id="e-add">${icons.plus.replace('<svg', '<svg width="18" height="18"')} ajouter un ingrédient</button>

      ${d.ingredients.length ? `
        <div class="card section">
          <div class="kv"><span>une portion</span><span>${fmt(food.serving.grams)} g · ${fmt(per.kcal)} kcal</span></div>
          <div class="kv"><span>protéines / glucides / lipides</span><span>${fmt(per.prot)} / ${fmt(per.carb)} / ${fmt(per.fat)} g</span></div>
          <div class="kv"><span>recette entière</span><span>${fmt(tot.kcal)} kcal</span></div>
        </div>` : ''}
      <button class="btn btn-primary section" id="e-save" ${d.name.trim() && d.ingredients.length ? '' : 'disabled'}>enregistrer la recette</button>
    `;
    const nameIn = $('#e-name', root), pIn = $('#e-portions', root), save = $('#e-save', root);
    const canSave = () => { save.disabled = !(d.name.trim() && d.ingredients.length); };
    nameIn.addEventListener('input', () => { d.name = nameIn.value; canSave(); });
    pIn.addEventListener('change', () => { d.portions = Math.max(1, Math.round(num(pIn.value) || 1)); draw(); });
    root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { d.portions = Math.max(1, (+d.portions || 1) + +b.dataset.p); draw(); }));
    root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { d.ingredients.splice(+b.dataset.del, 1); draw(); }));
    $('#e-add', root).onclick = () => openIngredientPicker({ onPick: (ing) => { d.ingredients.push(ing); draw(); } });
    $('#e-back', root).onclick = () => nav.go('#/recipes');
    save.onclick = () => {
      d.name = nameIn.value.trim();
      if (!d.name || !d.ingredients.length) return;
      saveRecipe({ ...d, portions: Math.max(1, +d.portions || 1) });
      ui.recipeDraft = null;
      toast('recette enregistrée ✦');
      nav.go('#/recipes');
    };
  };
  draw();
}
