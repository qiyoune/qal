// Calculs : dépense énergétique, objectifs, totaux du jour

export const NUTRIENTS = {
  kcal: { label: 'calories', unit: 'kcal' },
  prot: { label: 'protéines', unit: 'g' },
  carb: { label: 'glucides', unit: 'g' },
  fat: { label: 'lipides', unit: 'g' },
  sugar: { label: 'sucres', unit: 'g' },
  fiber: { label: 'fibres', unit: 'g' },
  satfat: { label: 'AG saturés', unit: 'g' },
  salt: { label: 'sel', unit: 'g' },
  calcium: { label: 'calcium', unit: 'mg' },
  iron: { label: 'fer', unit: 'mg' },
  magnesium: { label: 'magnésium', unit: 'mg' },
  potassium: { label: 'potassium', unit: 'mg' },
  zinc: { label: 'zinc', unit: 'mg' },
  vitD: { label: 'vitamine D', unit: 'µg' },
  vitC: { label: 'vitamine C', unit: 'mg' },
  folate: { label: 'vitamine B9', unit: 'µg' },
  b12: { label: 'vitamine B12', unit: 'µg' },
};

export const MICROS = ['calcium', 'iron', 'magnesium', 'potassium', 'zinc', 'vitD', 'vitC', 'folate', 'b12'];

// Repères journaliers (références nutritionnelles ANSES / EFSA, adultes)
export function references(profile) {
  const f = profile?.sex === 'f';
  return {
    fiber: { target: 30 },
    sugar: { limit: 90 },           // apport de référence UE (sucres totaux)
    satfat: { limit: null },        // calculé : 10 % des kcal
    salt: { limit: f ? 6.5 : 8 },   // repère ANSES (on vise moins)
    calcium: { target: 950 },
    iron: { target: f ? 16 : 11 },
    magnesium: { target: f ? 300 : 380 },
    potassium: { target: 3500 },
    zinc: { target: f ? 8.9 : 11.7 },
    vitD: { target: 15 },
    vitC: { target: 110 },
    folate: { target: 330 },
    b12: { target: 4 },
  };
}

const BASE_ACTIVITY = { assis: 1.2, debout: 1.35, physique: 1.5 };
const STEPS_ACTIVITY = { lt5: 1.2, '5to8': 1.3, '8to12': 1.4, gt12: 1.52 };
const TRAINING_ADD = { 0: 0, 1: 0.1, 2: 0.2, 3: 0.3 };

export function computeTargets(p) {
  const w = +p.weight, h = +p.height, a = +p.age;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * a + (p.sex === 'f' ? -161 : 5));
  // les pas (s'ils sont connus) affinent l'activité du quotidien
  const base = Math.max(BASE_ACTIVITY[p.daily] || 1.2, STEPS_ACTIVITY[p.steps] || 0);
  const factor = Math.min(1.95, base + (TRAINING_ADD[p.trainFreq] || 0));
  const tdee = Math.round(bmr * factor);

  let delta = 0;
  if (p.goal === 'lose') delta = p.pace === 'fast' ? -0.2 : -0.12;
  if (p.goal === 'gain') delta = p.pace === 'fast' ? 0.12 : 0.06;
  let kcal = Math.round((tdee * (1 + delta)) / 10) * 10;
  kcal = Math.max(kcal, p.sex === 'f' ? 1200 : 1400);

  const lifts = (p.training || []).includes('muscu');
  let protPerKg = 1.6;
  if (lifts || p.goal === 'lose') protPerKg = 2.0;
  if (p.goal === 'gain' && lifts) protPerKg = 1.9;
  if (p.appetite === 'gros' || p.appetite === 'grignote') protPerKg += 0.2; // les protéines calent
  protPerKg = Math.min(protPerKg, 2.3);

  const prot = Math.round(w * protPerKg);
  const fat = Math.round(Math.max(w * 0.8, (kcal * 0.25) / 9));
  const carb = Math.max(50, Math.round((kcal - prot * 4 - fat * 9) / 4));
  const fiber = Math.round((kcal / 1000) * 14);

  // durée estimée jusqu'au poids visé (7 700 kcal ≈ 1 kg)
  let weeks = null;
  const tw = +p.targetWeight;
  if (tw && p.goal !== 'maintain' && Math.abs(tw - w) >= 0.5) {
    const perWeek = Math.abs(kcal - tdee) * 7 / 7700;
    const right = (p.goal === 'lose' && tw < w) || (p.goal === 'gain' && tw > w);
    if (right && perWeek > 0.05) weeks = Math.round(Math.abs(tw - w) / perWeek);
  }

  return { bmr, tdee, factor: Math.round(factor * 100) / 100, kcal, prot, carb, fat, fiber, protPerKg, weeks };
}

export function tipsFor(p) {
  const tips = [];
  if (p.appetite === 'gros') tips.push("Tu aimes manger : mise sur les aliments à gros volume et peu caloriques (légumes, soupes, fruits, skyr, viandes maigres). Tu rempliras l'assiette sans exploser le compteur.");
  if (p.appetite === 'grignote') tips.push('Tu grignotes : garde une collation prévue dans ton objectif (fruit + yaourt, œufs durs, amandes pesées). Un grignotage planifié ne fait pas dérailler.');
  if (p.appetite === 'petit' && p.goal === 'gain') tips.push("Petit appétit + prise de masse : privilégie les aliments denses (huile d'olive, oléagineux, flocons d'avoine, fromage) et les calories liquides (smoothies, lait).");
  if (p.appetite === 'petit' && p.goal !== 'gain') tips.push('Petit appétit : concentre-toi surtout sur ton objectif de protéines, le reste suivra.');
  if ((p.training || []).includes('muscu')) tips.push('Muscu : répartis tes protéines sur 3-4 repas (≈ 25-40 g chacun), c\'est plus efficace que tout d\'un coup.');
  if (p.diet === 'vege' || p.diet === 'vegan') tips.push(`${p.diet === 'vegan' ? 'Vegan' : 'Végétarien'} : vise des protéines à chaque repas (tofu, lentilles, pois chiches, ${p.diet === 'vegan' ? 'seitan, protéine de pois' : 'œufs, skyr, fromage'}). ${p.diet === 'vegan' ? 'Et pense à la vitamine B12 en complément.' : ''}`.trim());
  if (p.cooking === 'never') tips.push('Tu cuisines peu : garde quelques valeurs sûres (skyr, thon, œufs durs, riz en sachet, poulet rôti, wraps) et enregistre tes plats habituels en recettes pour les ajouter en un tap.');
  if (p.meals === 2) tips.push('Avec 2 repas par jour, répartis tes protéines sur ces deux repas (au moins 40 g chacun) pour atteindre ton objectif.');
  if (p.goal === 'lose') tips.push('Pèse-toi dans les mêmes conditions (le matin, à jeun) et regarde la moyenne de la semaine, pas le chiffre du jour.');
  return tips;
}

// Valeurs pour une quantité donnée (per100 = valeurs pour 100 g)
export function scale(per100, grams) {
  const out = {};
  for (const k of Object.keys(NUTRIENTS)) {
    const v = per100?.[k];
    out[k] = v == null ? null : (v * grams) / 100;
  }
  return out;
}

export function totals(entries) {
  const t = {}; const known = {};
  for (const k of Object.keys(NUTRIENTS)) { t[k] = 0; known[k] = 0; }
  for (const e of entries) {
    const v = scale(e.per100, e.grams);
    for (const k of Object.keys(NUTRIENTS)) {
      if (v[k] != null) { t[k] += v[k]; known[k] += 1; }
    }
  }
  return { t, known, count: entries.length };
}

export const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const fmtSmart = (n) => (n == null ? '–' : n < 10 ? fmt(n, 1) : fmt(n, 0));

/* ---------- Poids : tendance et dépense réelle ---------- */
// Moyenne mobile sur 7 jours (sur les pesées disponibles)
export function movingAvg(list, days = 7) {
  return list.map((w) => {
    const t = new Date(w.date).getTime();
    const win = list.filter((x) => { const d = (t - new Date(x.date).getTime()) / 864e5; return d >= 0 && d < days; });
    return { date: w.date, avg: win.reduce((s, x) => s + x.kg, 0) / win.length };
  });
}

// Pente (kg / jour) par régression linéaire
function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : 0;
}

/**
 * Dépense réelle estimée à partir de ce que tu manges et de l'évolution de ton poids
 * (21 derniers jours). Il faut au moins 6 pesées sur 14 jours et 10 jours de repas notés.
 * dailyKcal : { 'YYYY-MM-DD': kcal } pour les jours suivis
 */
export function adaptiveEstimate(weights, dailyKcal, today) {
  const end = new Date(today).getTime();
  const from = end - 20 * 864e5;
  const ws = weights.filter((w) => new Date(w.date).getTime() >= from);
  const days = Object.entries(dailyKcal).filter(([d, k]) => new Date(d).getTime() >= from && k > 300);
  if (ws.length < 6 || days.length < 10) return { ready: false, weighIns: ws.length, loggedDays: days.length };
  const span = (new Date(ws[ws.length - 1].date) - new Date(ws[0].date)) / 864e5;
  if (span < 13) return { ready: false, weighIns: ws.length, loggedDays: days.length };
  const kgPerDay = slope(ws.map((w) => ({ x: new Date(w.date).getTime() / 864e5, y: w.kg })));
  const intake = days.reduce((s, [, k]) => s + k, 0) / days.length;
  const tdee = Math.round((intake - kgPerDay * 7700) / 10) * 10;
  return { ready: true, tdee, intake: Math.round(intake), kgPerWeek: Math.round(kgPerDay * 7 * 100) / 100 };
}

// Nouvel objectif à partir d'une dépense réelle (garde protéines et lipides, ajuste les glucides)
export function goalsFromTdee(tdee, profile, goals) {
  let delta = 0;
  if (profile.goal === 'lose') delta = profile.pace === 'fast' ? -0.2 : -0.12;
  if (profile.goal === 'gain') delta = profile.pace === 'fast' ? 0.12 : 0.06;
  const kcal = Math.max(profile.sex === 'f' ? 1200 : 1400, Math.round((tdee * (1 + delta)) / 10) * 10);
  const carb = Math.max(50, Math.round((kcal - goals.prot * 4 - goals.fat * 9) / 4));
  return { ...goals, kcal, carb, fiber: Math.round((kcal / 1000) * 14), custom: false };
}
