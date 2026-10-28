// Actions proposées par l'IA : on trouve les vrais aliments (Ciqual / tes aliments),
// on affiche une carte, et rien n'est appliqué sans "valider".
import { esc } from './ui.js';
import { getState, getRecipe, MEALS, setProfile, setGoals, addEntry, updateEntry, deleteEntry, saveRecipe, saveCustomFood, recentFoods, customFoods, listRecipes, recipeAsFood } from './store.js';
import { loadCiqual, norm } from './foods.js';
import { findDishPhotos, urlToDataUrl } from './photos.js';
import { scale, fmt, computeTargets } from './nutrition.js';
import { dateStr, mealForNow } from './ui.js';

const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || id;
// accepte l'id ou le nom du repas ("déjeuner", "lunch"…)
const validMeal = (m) => {
  if (MEALS.some((x) => x.id === m)) return m;
  const n = norm(String(m || ''));
  const byName = MEALS.find((x) => norm(x.label) === n || (n && norm(x.label).includes(n)));
  if (byName) return byName.id;
  const alias = { breakfast: ['petit', 'matin'], lunch: ['dejeuner', 'midi'], dinner: ['diner', 'soir'], snack: ['collation', 'gouter', 'snack'] }[m];
  const byAlias = alias && MEALS.find((x) => alias.some((w) => norm(x.label).includes(w)));
  return byAlias ? byAlias.id : mealForNow();
};
const grams = (g) => Math.max(1, Math.min(3000, Math.round(+g || 0)));

// Cherche l'aliment : d'abord tes aliments et recettes, puis la table Ciqual
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'au', 'aux', 'a', 'et', 'en', 'un', 'une', 'avec', 'sans', 'ou', 'pour',
  'maison', 'fait', 'faite', 'tranche', 'morceau', 'portion', 'part', 'petit', 'petite', 'gros', 'grosse', 'grand', 'grande', 'bol', 'assiette', 'cuillere', 'verre']);
// pluriel → singulier : « pommes » trouve « Pomme, crue », « frites » trouve « Frites… »
const stem = (w) => (w.length > 3 ? w.replace(/(s|x)$/, '') : w);
const keyWords = (txt) => norm(txt).split(' ').map(stem).filter((w) => w.length > 1 && !STOP.has(w));
const STATES = ['cuit', 'cru', 'crue', 'frit', 'grille', 'vapeur', 'bouilli', 'nature', 'entier', 'demi'];
// façon de couper ou cuire : on peut s'en passer pour trouver l'aliment (« carottes râpées » → « Carotte, crue »)
const PREP = ['rape', 'rapee', 'emince', 'eminces', 'hache', 'coupe', 'cube', 'des', 'tranche', 'brouille', 'poele', 'saute', 'grille', 'roti', 'cuit', 'cuite', 'cru', 'crue', 'frit', 'vapeur', 'nature', 'bio'];
// produits tirés d'un aliment : « Huile d'amande » n'est pas une amande, sauf si on demande de l'huile
const DERIVED = ['huile', 'farine', 'jus', 'sirop', 'sauce', 'lait', 'creme', 'poudre', 'pate', 'puree', 'compote', 'confiture', 'chip', 'pizza', 'tarte', 'biscuit', 'gateau', 'glace', 'soupe', 'veloute', 'boisson', 'nectar', 'barre', 'cereale', 'specialite'];

function bestOf(list, words, raw = []) {
  const need = Math.max(1, Math.ceil(words.length * 0.6));
  const vegetal = words.some((w) => w.startsWith('vegeta'));
  let top = null, topScore = -Infinity;
  for (const f of list) {
    const n = f._n || norm(f.name + ' ' + (f.brand || ''));
    let hit = 0;
    for (const w of words) if (n.includes(w)) hit++;
    if (hit < need || !n.includes(words[0]) && hit < words.length) continue;
    // l'aliment demandé doit être l'aliment principal (avant la 1re virgule ou parenthèse) : pas « Pilchard, sauce tomate » pour une sauce tomate
    const main = f._h || norm(String(f.name).split(/[,(]/)[0]);
    if (f._n) f._h = main; // cache, seulement pour la table Ciqual (pas dans tes données)
    // … et son 1er mot : « Croissant aux amandes » n'est pas une amande, « Moules à la sauce tomate » pas une sauce
    const lead = main.split(' ').map(stem).filter((w) => !STOP.has(w))[0];
    if (!words.includes(lead)) continue;
    const head = stem(n.split(' ')[0]);
    if (DERIVED.includes(head) && !words.includes(head)) continue;
    if (!vegetal && n.includes('vegeta')) continue; // pas de « Spécialité végétale type fromage » pour du fromage
    let score = hit * 20 - n.length / 15;
    // mot exact (avec son pluriel) : « pâtes cuites » préfère « Pâtes…, cuites » à « Pâte sablée, cuite »
    for (const r of raw) if (r.length > 3 && new RegExp(`\\b${r}\\b`).test(n)) score += 5;
    // l'aliment principal est au début du nom Ciqual (« Poulet, poitrine, … »)
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
  [/\bfromage blanc\b/, 'fromage blanc'],
  [/\bfromage rape\b/, 'emmental rape'],
  [/\bcreme fraiche\b/, 'creme de lait'],
  [/\bbaguette\b/, 'pain baguette'],
  [/\b(spaghettis?|tagliatelles?|penne|coquillettes?|macaronis?|fusillis?)\b/, 'pates'],
];
async function findFood(name) {
  let q = norm(name);
  for (const [re, rep] of SYN) q = q.replace(re, rep);
  const words = keyWords(q);
  if (!words.length) return null;
  const raw = q.split(' ');
  const best = (list, w) => bestOf(list, w, raw);
  const mine = [...listRecipes().map(recipeAsFood), ...customFoods(), ...recentFoods(200)];
  const own = best(mine, words);
  if (own && words.every((w) => norm(own.name + ' ' + (own.brand || '')).includes(w))) return own;
  const list = await loadCiqual();
  const ciq = best(list, words);
  if (ciq || own) return ciq || own;
  // rien d'exact : on retire les précisions de la fin (« lentilles corail cuites bio » → « lentilles corail cuites »)
  // mais jamais jusqu'à un seul mot : « sauce samouraï » ne doit pas devenir « sauce soja »
  for (let k = words.length - 1; k >= 2; k--) {
    const f = best(list, words.slice(0, k));
    if (f) return f;
  }
  // sans la façon de préparer : seul l'aliment exact compte (« carotte » → « Carotte, crue », pas « Carottes râpées en sauce »)
  const base = words.filter((w) => !PREP.includes(w));
  if (base.length && base.length < words.length) {
    const f = best(list, base);
    if (f && (base.length > 1 || stem(f._h.split(' ')[0]) === base[0])) return f;
  }
  return null;
}

// Pas dans la table : on garde l'estimation de l'IA (pour 100 g) plutôt que « introuvable »
function estimated(it) {
  const v = (x) => (x == null || x === '' || isNaN(+x) ? null : Math.round(+x * 10) / 10);
  const per100 = { kcal: v(it.kcal), prot: v(it.prot), carb: v(it.carb), fat: v(it.fat) };
  if (per100.kcal == null || per100.kcal < 0 || per100.kcal > 900) return null;
  const name = String(it.name || '').trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), brand: '', per100, source: 'ia', code: '', img: '', serving: null };
}
const lookup = async (it) => clean(await findFood(it.name)) || estimated(it);

const clean = (f) => f && ({ name: f.name, brand: f.brand || '', per100: f.per100, source: f.source, code: f.code || '', img: f.img || '', serving: f.serving || null });

export async function resolveCalls(calls) {
  const out = [];
  const entries = getState().entries;
  for (const c of calls) {
    const a = c.args || {};
    if (c.name === 'add_foods') {
      const items = [];
      for (const it of a.items || []) items.push({ query: it.name, grams: grams(it.grams), food: await lookup(it) });
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
    } else if (c.name === 'update_goals') {
      const g = goalsProposal(a);
      if (g) out.push(g);
    } else if (c.name === 'create_recipe') {
      const ingredients = [];
      for (const it of a.ingredients || []) ingredients.push({ query: it.name, grams: grams(it.grams), food: await lookup(it) });
      const name = String(a.name || 'Recette').slice(0, 60);
      const photos = await findDishPhotos(a.photo_query || name).catch(() => []);
      out.push({ type: 'recipe', name, portions: Math.max(1, Math.min(50, Math.round(+a.portions || 1))), preparation: String(a.preparation || '').slice(0, 3000), ingredients, photos, photoIdx: 0 });
    }
  }
  return out;
}

// Nouveaux objectifs : on recalcule tout nous-mêmes, avec des garde-fous
const GOALS = { lose: 'perdre du gras', maintain: 'maintenir', gain: 'prendre du muscle' };
const PACE = { slow: 'tranquille', fast: 'soutenu' };
function goalsProposal(a) {
  const st = getState();
  const p = st.profile, old = st.goals;
  if (!p || !old) return null;
  const np = { ...p };
  if (GOALS[a.goal]) np.goal = a.goal;
  if (PACE[a.pace]) np.pace = a.pace;
  const tw = +a.target_weight;
  if (tw >= 30 && tw <= 250) np.targetWeight = Math.round(tw * 10) / 10;
  if (np.goal === 'maintain') { np.pace = null; np.targetWeight = null; }
  else if (!np.pace) np.pace = 'slow';
  const t = computeTargets(np);
  const floor = np.sex === 'f' ? 1200 : 1400;
  let kcal = t.kcal, limited = false;
  const ask = +a.kcal || (a.prot && a.carb && a.fat ? a.prot * 4 + a.carb * 4 + a.fat * 9 : 0);
  if (ask) {
    const lo = Math.max(floor, Math.round(t.tdee * 0.75)), hi = Math.round(t.tdee * 1.3);
    kcal = Math.round(Math.min(hi, Math.max(lo, ask)) / 10) * 10;
    limited = Math.abs(kcal - ask) > 15;
  }
  const r = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, +v)));
  const prot = a.prot ? r(a.prot, 40, 350) : t.prot;
  const fat = a.fat ? r(a.fat, 30, 250) : Math.round(Math.max(np.weight * 0.8, (kcal * 0.25) / 9));
  const carb = a.carb && !limited ? r(a.carb, 30, 700) : Math.max(50, Math.round((kcal - prot * 4 - fat * 9) / 4));
  let weeks = null;
  if (np.targetWeight && np.goal !== 'maintain') {
    const perWeek = Math.abs(kcal - t.tdee) * 7 / 7700;
    const right = (np.goal === 'lose' && np.targetWeight < np.weight) || (np.goal === 'gain' && np.targetWeight > np.weight);
    if (right && perWeek > 0.05) weeks = Math.round(Math.abs(np.targetWeight - np.weight) / perWeek);
  }
  return {
    type: 'goals', limited, weeks, tdee: t.tdee, reason: String(a.reason || '').slice(0, 200),
    from: { goal: p.goal, pace: p.pace, targetWeight: p.targetWeight, kcal: old.kcal, prot: old.prot, carb: old.carb, fat: old.fat },
    to: { goal: np.goal, pace: np.pace, targetWeight: np.targetWeight, kcal, prot, carb, fat, fiber: Math.round((kcal / 1000) * 14) },
    custom: !!ask || !!a.prot || !!a.carb || !!a.fat,
  };
}
const chg = (label, a, b, unit = '') => `<li><span>${label}</span><b>${a === b ? `${esc(b ?? '–')}${unit}` : `${esc(a ?? '–')}${unit} → ${esc(b ?? '–')}${unit}`}</b></li>`;

// En attente de validation, chaque ligne se touche pour choisir un autre aliment
const line = (it, k, pending) => {
  const attr = pending ? ` data-swap="${k}" role="button" tabindex="0"` : '';
  if (!it.food) return `<li class="missing"${attr}><span>${esc(it.query)}</span><b>${pending ? 'choisir ›' : 'non ajouté'}</b></li>`;
  const est = it.food.source === 'ia' ? '<i class="ac-est" title="valeurs estimées par l’IA">≈</i> ' : '';
  return `<li${attr}><span>${est}${esc(it.food.name)}</span><b>${fmt(it.grams)} g · ${fmt(scale(it.food.per100, it.grams).kcal)} kcal</b></li>`;
};
const lines = (list, p) => { const pending = !p.status || p.status === 'pending'; return list.map((it, k) => line(it, k, pending)).join(''); };
const estNote = (list) => (list.some((i) => i.food?.source === 'ia') ? '<p class="ac-note">≈ pas trouvé dans la table : valeurs estimées par l’IA. Touche une ligne pour choisir un autre aliment.</p>' : '');

export function proposalHtml(p) {
  if (p.type === 'add') {
    const ok = p.items.filter((i) => i.food);
    const kcal = ok.reduce((s, i) => s + (scale(i.food.per100, i.grams).kcal || 0), 0);
    return `<div class="ac-title">ajouter · ${esc(mealLabel(p.meal))}${p.date !== dateStr() ? ` · ${esc(p.date)}` : ''}</div><ul>${lines(p.items, p)}</ul><div class="ac-total">${fmt(kcal)} kcal</div>${estNote(p.items)}`;
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
  if (p.type === 'goals') {
    const f = p.from, t = p.to;
    return `<div class="ac-title">nouvel objectif</div><ul>
      ${f.goal !== t.goal ? chg('but', GOALS[f.goal], GOALS[t.goal]) : ''}
      ${(f.pace || null) !== (t.pace || null) ? chg('rythme', PACE[f.pace] || '–', PACE[t.pace] || '–') : ''}
      ${(f.targetWeight || null) !== (t.targetWeight || null) ? chg('poids visé', f.targetWeight || '–', t.targetWeight || '–', ' kg') : ''}
      ${chg('calories', f.kcal, t.kcal, ' kcal')}
      <li><span>protéines · glucides · lipides</span><b>${t.prot} · ${t.carb} · ${t.fat} g</b></li>
    </ul><div class="ac-total">${p.weeks ? `poids visé dans ≈ ${p.weeks} semaine${p.weeks > 1 ? 's' : ''}` : `dépense ≈ ${fmt(p.tdee)} kcal`}</div>${p.limited ? '<p class="ac-prep">Limité pour rester sain : au-delà, tu perdrais surtout du muscle et de l\'énergie.</p>' : ''}`;
  }
  if (p.type === 'recipe') {
    const ok = p.ingredients.filter((i) => i.food);
    const tot = ok.reduce((s, i) => s + (scale(i.food.per100, i.grams).kcal || 0), 0);
    const ph = p.photos?.[p.photoIdx];
    const photoHtml = p.photoGen === 'busy' ? '<div class="ac-photo"><span class="ac-nophoto">je génère une photo du plat…</span></div>'
      : p.photos?.length ? `<div class="ac-photo">${ph ? `<img src="${esc(ph.url)}" alt="" loading="lazy" onerror="this.style.opacity=0" />` : '<span class="ac-nophoto">sans photo</span>'}${p.status === 'pending' || !p.status ? `<button type="button" class="rp-btn" data-photo>${ph ? 'autre photo' : 'remettre une photo'}</button>` : ''}</div>${ph ? `<div class="ac-credit">photo : ${esc(ph.credit)}</div>` : ''}` : '';
    return `${photoHtml}<div class="ac-title">nouvelle recette : ${esc(p.name)}</div><ul>${lines(p.ingredients, p)}</ul><div class="ac-total">${fmt(tot / p.portions)} kcal / portion · ${p.portions} portion${p.portions > 1 ? 's' : ''}</div>${estNote(p.ingredients)}${p.preparation ? `<p class="ac-prep">${esc(p.preparation).replace(/\n/g, '<br>')}</p>` : ''}`;
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
  if (p.type === 'goals') {
    const st = getState();
    const { kcal, prot, carb, fat, fiber, goal, pace, targetWeight } = p.to;
    setProfile({ ...st.profile, goal, pace, targetWeight });
    setGoals({ ...st.goals, kcal, prot, carb, fat, fiber, custom: p.custom });
    return 'objectif mis à jour ✦';
  }
  if (p.type === 'recipe') {
    const ph = p.photos?.[p.photoIdx];
    const r = saveRecipe({ name: p.name, portions: p.portions, preparation: p.preparation, photo: ph?.url || '', photoCredit: ph?.credit || '', ingredients: p.ingredients.filter((i) => i.food).map((i) => ({ ...i.food, grams: i.grams })) });
    // on télécharge la photo pour qu'elle reste même hors ligne
    if (ph) urlToDataUrl(ph.url).then((d) => { const cur = getRecipe(r.id); if (cur && cur.photo === ph.url) saveRecipe({ ...cur, photo: d }); }).catch(() => {});
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
  if (p.type === 'goals') return `[action ${st} : objectif ${p.to.goal}${p.to.pace ? ' ' + p.to.pace : ''}, ${p.to.kcal} kcal, P ${p.to.prot} g${p.limited ? ' (limité par les garde-fous)' : ''}]`;
  return '';
}
