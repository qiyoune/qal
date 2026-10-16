// Stockage local + fusion (pour la synchro entre appareils)
const KEY = 'qal:v1';
const listeners = new Set();

export const MEALS = [
  { id: 'breakfast', label: 'petit-déj' },
  { id: 'lunch', label: 'déjeuner' },
  { id: 'snack', label: 'collation' },
  { id: 'dinner', label: 'dîner' },
];

const empty = () => ({
  v: 1,
  profile: null,   // { ..., updatedAt }
  goals: null,     // { kcal, prot, carb, fat, fiber, custom, updatedAt }
  entries: {},     // id -> { id, date, meal, name, brand, grams, per100, source, code, img, updatedAt, deleted }
  foods: {},       // key -> { key, name, brand, per100, source, code, img, serving, count, usedAt, custom, updatedAt, deleted }
  weights: {},     // date -> { date, kg, updatedAt, deleted }
  recipes: {},     // id -> { id, name, portions, ingredients: [{ name, brand, grams, per100, source, code }], updatedAt, deleted }
  meta: { deviceId: uid(), createdAt: Date.now() },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { ...empty(), ...s, meta: { ...empty().meta, ...(s.meta || {}) } };
  } catch {
    return empty();
  }
}

function persist(fromSync = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  listeners.forEach((fn) => fn({ fromSync }));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getState() { return state; }

/* ---------- Profil / objectifs ---------- */
export function setProfile(profile) {
  state.profile = { ...profile, updatedAt: Date.now() };
  persist();
}
export function setGoals(goals) {
  state.goals = { ...goals, updatedAt: Date.now() };
  persist();
}

/* ---------- Journal ---------- */
export function entriesFor(date) {
  return Object.values(state.entries)
    .filter((e) => e.date === date && !e.deleted)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function addEntry({ date, meal, food, grams }) {
  const id = uid();
  const now = Date.now();
  state.entries[id] = {
    id, date, meal, grams,
    name: food.name, brand: food.brand || '', per100: food.per100,
    source: food.source, code: food.code || '', img: food.img || '',
    serving: food.serving || null,
    createdAt: now, updatedAt: now,
  };
  rememberFood(food, grams);
  persist();
  return id;
}

export function updateEntry(id, patch) {
  const e = state.entries[id];
  if (!e) return;
  state.entries[id] = { ...e, ...patch, updatedAt: Date.now() };
  persist();
}

export function deleteEntry(id) {
  const e = state.entries[id];
  if (!e) return;
  // On garde une "pierre tombale" pour que la suppression se propage aux autres appareils
  state.entries[id] = { id, date: e.date, deleted: true, updatedAt: Date.now() };
  persist();
}

/* ---------- Aliments récents / perso ---------- */
export function foodKey(food) {
  if (food.code) return 'code:' + food.code;
  if (food.source === 'ciqual') return 'ciqual:' + food.name;
  return (food.source || 'x') + ':' + food.name + '|' + (food.brand || '');
}

function rememberFood(food, grams) {
  const { _n, lastGrams, count, usedAt, ...clean } = food;
  const key = foodKey(clean);
  const prev = state.foods[key] || {};
  state.foods[key] = {
    ...prev, ...clean, key,
    lastGrams: grams,
    count: (prev.count || 0) + 1,
    usedAt: Date.now(),
    updatedAt: Date.now(),
    deleted: false,
  };
}

export function saveCustomFood(food) {
  const f = { ...food, source: 'perso', custom: true };
  const key = foodKey(f);
  state.foods[key] = { ...(state.foods[key] || {}), ...f, key, updatedAt: Date.now(), usedAt: Date.now(), deleted: false };
  persist();
  return state.foods[key];
}

export function deleteFood(key) {
  if (!state.foods[key]) return;
  state.foods[key] = { key, deleted: true, updatedAt: Date.now() };
  persist();
}

export function recentFoods(limit = 40) {
  return Object.values(state.foods)
    .filter((f) => !f.deleted && f.name)
    .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0))
    .slice(0, limit);
}

export function customFoods() {
  return Object.values(state.foods).filter((f) => !f.deleted && f.custom).sort((a, b) => a.name.localeCompare(b.name));
}

export function findFoodByCode(code) {
  const f = state.foods['code:' + code];
  return f && !f.deleted ? f : null;
}

/* ---------- Poids ---------- */
export function setWeight(date, kg) {
  state.weights = state.weights || {};
  state.weights[date] = { date, kg: Math.round(kg * 10) / 10, updatedAt: Date.now() };
  // le profil suit le dernier poids (pour les calculs)
  const last = weightsList().slice(-1)[0];
  if (last && state.profile) state.profile = { ...state.profile, weight: last.kg, updatedAt: Date.now() };
  persist();
}
export function deleteWeight(date) {
  if (!state.weights?.[date]) return;
  state.weights[date] = { date, deleted: true, updatedAt: Date.now() };
  persist();
}
export function weightsList() {
  return Object.values(state.weights || {}).filter((w) => !w.deleted && w.kg).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Favoris ---------- */
export function isFav(food) {
  const f = state.foods[foodKey(food)];
  return !!(f && !f.deleted && f.fav);
}
export function toggleFav(food) {
  const { _n, lastGrams, count, usedAt, ...clean } = food;
  const key = foodKey(clean);
  const prev = state.foods[key] || {};
  const fav = !(prev.fav && !prev.deleted);
  state.foods[key] = { ...prev, ...clean, key, fav, deleted: false, usedAt: prev.usedAt || Date.now(), updatedAt: Date.now() };
  persist();
  return fav;
}
export function favFoods() {
  return Object.values(state.foods).filter((f) => !f.deleted && f.fav && f.name).sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- Recettes ---------- */
export function listRecipes() {
  return Object.values(state.recipes || {}).filter((r) => !r.deleted && r.name).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function getRecipe(id) {
  const r = state.recipes?.[id];
  return r && !r.deleted ? r : null;
}
export function saveRecipe(recipe) {
  const id = recipe.id || uid();
  const now = Date.now();
  state.recipes = state.recipes || {};
  state.recipes[id] = { ...recipe, id, createdAt: recipe.createdAt || now, updatedAt: now, deleted: false };
  persist();
  return state.recipes[id];
}
export function deleteRecipe(id) {
  if (!state.recipes?.[id]) return;
  state.recipes[id] = { id, deleted: true, updatedAt: Date.now() };
  persist();
}
// Une recette devient un "aliment" : valeurs pour 100 g + une portion
export function recipeAsFood(r) {
  const totalG = r.ingredients.reduce((s, i) => s + (+i.grams || 0), 0) || 1;
  const keys = new Set(r.ingredients.flatMap((i) => Object.keys(i.per100 || {})));
  const per100 = {};
  for (const k of keys) {
    let sum = 0, known = false;
    for (const i of r.ingredients) { const v = i.per100?.[k]; if (v != null) { sum += (v * i.grams) / 100; known = true; } }
    per100[k] = known ? (sum * 100) / totalG : null;
  }
  const portions = Math.max(1, +r.portions || 1);
  return { name: r.name, brand: '', per100, source: 'recette', recipeId: r.id, serving: { grams: Math.round(totalG / portions), label: 'portion' }, totalGrams: totalG };
}

/* ---------- Sync helpers ---------- */
export function setMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function exportData() {
  return JSON.parse(JSON.stringify(state));
}

// Fusion : pour chaque élément, la version la plus récente gagne.
export function merge(a, b) {
  if (!b) return a;
  if (!a) return b;
  const pick = (x, y) => (!x ? y : !y ? x : (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
  const mergeMap = (m1 = {}, m2 = {}) => {
    const out = { ...m1 };
    for (const [k, v] of Object.entries(m2)) out[k] = pick(out[k], v);
    return out;
  };
  return {
    v: 1,
    profile: pick(a.profile, b.profile),
    goals: pick(a.goals, b.goals),
    entries: prune(mergeMap(a.entries, b.entries)),
    foods: prune(mergeMap(a.foods, b.foods)),
    recipes: prune(mergeMap(a.recipes, b.recipes)),
    weights: prune(mergeMap(a.weights, b.weights)),
    meta: a.meta,
  };
}

// Supprime les pierres tombales de plus de 90 jours
function prune(map) {
  const limit = Date.now() - 90 * 864e5;
  for (const [k, v] of Object.entries(map)) if (v.deleted && (v.updatedAt || 0) < limit) delete map[k];
  return map;
}

export function replaceState(next, { fromSync = true } = {}) {
  state = { ...empty(), ...next, meta: { ...state.meta, ...(next.meta || {}), deviceId: state.meta.deviceId } };
  persist(fromSync);
}

export function importData(data) {
  replaceState(merge(state, data), { fromSync: false });
}

export function resetAll() {
  state = empty();
  persist();
}
