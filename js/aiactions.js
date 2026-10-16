// Actions proposées par l'IA : on trouve les vrais aliments (Ciqual / tes aliments),
// on affiche une carte, et rien n'est appliqué sans "valider".
import { esc } from './ui.js';
import { getState, MEALS, addEntry, updateEntry, deleteEntry, saveRecipe, saveCustomFood, recentFoods, customFoods, listRecipes, recipeAsFood } from './store.js';
import { loadCiqual, norm } from './foods.js';
import { scale, fmt } from './nutrition.js';
import { dateStr, mealForNow } from './ui.js';

const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || id;
const validMeal = (m) => (MEALS.some((x) => x.id === m) ? m : mealForNow());
const grams = (g) => Math.max(1, Math.min(3000, Math.round(+g || 0)));

// Cherche l'aliment : d'abord tes aliments et recettes, puis la table Ciqual
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'au', 'aux', 'a', 'et', 'en', 'un', 'une', 'avec', 'sans']);
const keyWords = (txt) => norm(txt).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const STATES = ['cuit', 'cru', 'crue', 'frit', 'grille', 'vapeur', 'bouilli', 'nature', 'entier', 'demi'];

function best(list, words) {
  const need = Math.max(1, Math.ceil(words.length * 0.6));
  let top = null, topScore = -Infinity;
  for (const f of list) {
    const n = f._n || norm(f.name + ' ' + (f.brand || ''));
    let hit = 0;
    for (const w of words) if (n.includes(w)) hit++;
    if (hit < need || !n.includes(words[0]) && hit < words.length) continue;
    let score = hit * 20 - n.length / 15;
    // l'aliment principal est au début du nom Ciqual (« Poulet, poitrine, … »)
    const head = n.split(' ')[0];
    if (words.includes(head)) score += 18;
    if (n.startsWith(words[0])) score += 8;
    for (const st of STATES) if (words.includes(st) && !n.includes(st.replace(/e$/, ''))) score -= 12;
    if (score > topScore) { topScore = score; top = f; }
  }
  return top;
}

const SYN = [
  [/\b(blanc|filet|escalope)s? de poulet\b/, 'poulet poitrine'],
  [/\b(blanc|filet|escalope)s? de dinde\b/, 'dinde escalope'],
  [/\bsteak hache\b/, 'boeuf steak hache'],
  [/\boeufs?\b/, 'oeuf'],
  [/\bpates\b/, 'pates alimentaires'],
  [/\bfromage blanc\b/, 'fromage blanc'],
];
async function findFood(name) {
  let q = norm(name);
  for (const [re, rep] of SYN) q = q.replace(re, rep);
  const words = keyWords(q);
  if (!words.length) return null;
  const mine = [...listRecipes().map(recipeAsFood), ...customFoods(), ...recentFoods(200)];
  const own = best(mine, words);
  if (own && words.every((w) => norm(own.name + ' ' + (own.brand || '')).includes(w))) return own;
  const ciq = best(await loadCiqual(), words);
  return ciq || own || null;
}

const clean = (f) => f && ({ name: f.name, brand: f.brand || '', per100: f.per100, source: f.source, code: f.code || '', img: f.img || '', serving: f.serving || null });

export async function resolveCalls(calls) {
  const out = [];
  const entries = getState().entries;
  for (const c of calls) {
    const a = c.args || {};
    if (c.name === 'add_foods') {
      const items = [];
      for (const it of a.items || []) items.push({ query: it.name, grams: grams(it.grams), food: clean(await findFood(it.name)) });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : dateStr();
      out.push({ type: 'add', meal: validMeal(a.meal), date, items });
    } else if (c.name === 'update_entry' || c.name === 'delete_entry') {
      const e = entries[a.id];
      if (!e || e.deleted) continue;
      if (c.name === 'delete_entry') out.push({ type: 'delete', id: a.id, name: e.name, grams: e.grams, kcal: scale(e.per100, e.grams).kcal });
      else out.push({ type: 'update', id: a.id, name: e.name, from: { grams: e.grams, meal: e.meal }, to: { grams: a.grams ? grams(a.grams) : e.grams, meal: a.meal ? validMeal(a.meal) : e.meal }, per100: e.per100 });
    } else if (c.name === 'create_food') {
      const n = (v) => (v == null || isNaN(+v) ? null : Math.round(+v * 10) / 10);
      out.push({ type: 'food', name: String(a.name || 'Produit').slice(0, 60), brand: String(a.brand || '').slice(0, 40), code: String(a.barcode || '').replace(/\D/g, ''),
        per100: { kcal: n(a.kcal), prot: n(a.prot), carb: n(a.carb), fat: n(a.fat), sugar: n(a.sugar), fiber: n(a.fiber), salt: n(a.salt) },
        serving: n(a.serving_grams) ? { grams: n(a.serving_grams), label: 'portion' } : null });
    } else if (c.name === 'create_recipe') {
      const ingredients = [];
      for (const it of a.ingredients || []) ingredients.push({ query: it.name, grams: grams(it.grams), food: clean(await findFood(it.name)) });
      out.push({ type: 'recipe', name: String(a.name || 'Recette').slice(0, 60), portions: Math.max(1, Math.min(50, Math.round(+a.portions || 1))), preparation: String(a.preparation || '').slice(0, 3000), ingredients });
    }
  }
  return out;
}

const line = (it) => it.food
  ? `<li><span>${esc(it.food.name)}</span><b>${fmt(it.grams)} g · ${fmt(scale(it.food.per100, it.grams).kcal)} kcal</b></li>`
  : `<li class="missing"><span>${esc(it.query)}</span><b>introuvable</b></li>`;

export function proposalHtml(p) {
  if (p.type === 'add') {
    const ok = p.items.filter((i) => i.food);
    const kcal = ok.reduce((s, i) => s + (scale(i.food.per100, i.grams).kcal || 0), 0);
    return `<div class="ac-title">ajouter au ${esc(mealLabel(p.meal))}${p.date !== dateStr() ? ` · ${esc(p.date)}` : ''}</div><ul>${p.items.map(line).join('')}</ul><div class="ac-total">${fmt(kcal)} kcal</div>`;
  }
  if (p.type === 'update') {
    const k = scale(p.per100, p.to.grams).kcal;
    return `<div class="ac-title">modifier</div><ul><li><span>${esc(p.name)}</span><b>${fmt(p.from.grams)} → ${fmt(p.to.grams)} g${p.to.meal !== p.from.meal ? ` · ${esc(mealLabel(p.to.meal))}` : ''}</b></li></ul><div class="ac-total">${fmt(k)} kcal</div>`;
  }
  if (p.type === 'delete') return `<div class="ac-title">supprimer</div><ul><li><span>${esc(p.name)}</span><b>${fmt(p.grams)} g · ${fmt(p.kcal)} kcal</b></li></ul>`;
  if (p.type === 'food') {
    const v = p.per100;
    return `<div class="ac-title">nouvel aliment : ${esc(p.name)}${p.brand ? ` · ${esc(p.brand)}` : ''}</div><ul>
      <li><span>pour 100 g</span><b>${fmt(v.kcal)} kcal</b></li>
      <li><span>protéines · glucides · lipides</span><b>${fmt(v.prot, 1)} · ${fmt(v.carb, 1)} · ${fmt(v.fat, 1)} g</b></li>
      ${v.sugar != null || v.fiber != null || v.salt != null ? `<li><span>sucres · fibres · sel</span><b>${fmt(v.sugar, 1)} · ${fmt(v.fiber, 1)} · ${fmt(v.salt, 2)} g</b></li>` : ''}
      ${p.code ? `<li><span>code-barres</span><b>${esc(p.code)}</b></li>` : ''}
    </ul>`;
  }
  if (p.type === 'recipe') {
    const ok = p.ingredients.filter((i) => i.food);
    const tot = ok.reduce((s, i) => s + (scale(i.food.per100, i.grams).kcal || 0), 0);
    return `<div class="ac-title">nouvelle recette : ${esc(p.name)}</div><ul>${p.ingredients.map(line).join('')}</ul><div class="ac-total">${fmt(tot / p.portions)} kcal / portion · ${p.portions} portion${p.portions > 1 ? 's' : ''}</div>${p.preparation ? `<p class="ac-prep">${esc(p.preparation).replace(/\n/g, '<br>')}</p>` : ''}`;
  }
  return '';
}

export function canApply(p) {
  if (p.type === 'add') return p.items.some((i) => i.food);
  if (p.type === 'recipe') return p.ingredients.some((i) => i.food);
  if (p.type === 'food') return p.per100.kcal != null;
  return true;
}

export function applyProposal(p) {
  if (p.type === 'add') {
    p.items.filter((i) => i.food).forEach((i) => addEntry({ date: p.date, meal: p.meal, food: i.food, grams: i.grams }));
    return 'ajouté au journal ✦';
  }
  if (p.type === 'update') { updateEntry(p.id, { grams: p.to.grams, meal: p.to.meal }); return 'modifié ✦'; }
  if (p.type === 'delete') { deleteEntry(p.id); return 'supprimé'; }
  if (p.type === 'food') {
    saveCustomFood({ name: p.name, brand: p.brand, code: p.code, per100: p.per100, serving: p.serving });
    return 'aliment enregistré ✦ (retrouve-le dans la recherche)';
  }
  if (p.type === 'recipe') {
    saveRecipe({ name: p.name, portions: p.portions, preparation: p.preparation, ingredients: p.ingredients.filter((i) => i.food).map((i) => ({ ...i.food, grams: i.grams })) });
    return 'recette enregistrée ✦';
  }
  return '';
}

// Résumé texte pour l'historique envoyé à l'IA
export function proposalSummary(p, status) {
  const st = status === 'done' ? 'validé' : status === 'cancelled' ? 'annulé' : 'en attente';
  if (p.type === 'add') return `[action ${st} : ajout au ${p.meal} de ${p.items.map((i) => `${i.food?.name || i.query} ${i.grams} g`).join(', ')}]`;
  if (p.type === 'update') return `[action ${st} : ${p.name} → ${p.to.grams} g]`;
  if (p.type === 'delete') return `[action ${st} : suppression de ${p.name}]`;
  if (p.type === 'recipe') return `[action ${st} : recette ${p.name}]`;
  if (p.type === 'food') return `[action ${st} : aliment ${p.name}]`;
  return '';
}
