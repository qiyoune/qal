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
