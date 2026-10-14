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
const TRAINING_ADD = { 0: 0, 1: 0.1, 2: 0.2, 3: 0.3 };

export function computeTargets(p) {
  const w = +p.weight, h = +p.height, a = +p.age;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * a + (p.sex === 'f' ? -161 : 5));
  const factor = Math.min(1.95, (BASE_ACTIVITY[p.daily] || 1.2) + (TRAINING_ADD[p.trainFreq] || 0));
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

  return { bmr, tdee, factor: Math.round(factor * 100) / 100, kcal, prot, carb, fat, fiber, protPerKg };
}

export function tipsFor(p) {
  const tips = [];
  if (p.appetite === 'gros') tips.push("Tu aimes manger : mise sur les aliments à gros volume et peu caloriques (légumes, soupes, fruits, skyr, viandes maigres). Tu rempliras l'assiette sans exploser le compteur.");
  if (p.appetite === 'grignote') tips.push('Tu grignotes : garde une collation prévue dans ton objectif (fruit + yaourt, œufs durs, amandes pesées). Un grignotage planifié ne fait pas dérailler.');
  if (p.appetite === 'petit' && p.goal === 'gain') tips.push("Petit appétit + prise de masse : privilégie les aliments denses (huile d'olive, oléagineux, flocons d'avoine, fromage) et les calories liquides (smoothies, lait).");
  if (p.appetite === 'petit' && p.goal !== 'gain') tips.push('Petit appétit : concentre-toi surtout sur ton objectif de protéines, le reste suivra.');
  if ((p.training || []).includes('muscu')) tips.push('Muscu : répartis tes protéines sur 3-4 repas (≈ 25-40 g chacun), c\'est plus efficace que tout d\'un coup.');
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
