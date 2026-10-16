// Les choix du questionnaire, partagés avec le profil et l'IA

export const OPT = {
  sex: [{ v: 'm', em: '🙋‍♂️', t: 'un homme' }, { v: 'f', em: '🙋‍♀️', t: 'une femme' }],
  goal: [
    { v: 'lose', em: '📉', t: 'Perdre du gras' },
    { v: 'maintain', em: '⚖️', t: 'Garder mon poids', s: 'et mieux manger' },
    { v: 'gain', em: '📈', t: 'Prendre du muscle' },
  ],
  extraGoals: [
    { v: 'healthy', em: '🥦', t: 'Manger plus sainement' },
    { v: 'energy', em: '⚡', t: "Avoir plus d'énergie" },
    { v: 'perf', em: '🏅', t: 'Être plus performant au sport' },
    { v: 'snacking', em: '🍪', t: 'Moins grignoter' },
    { v: 'sugar', em: '🍬', t: 'Manger moins de sucre' },
    { v: 'digest', em: '🌿', t: 'Mieux digérer' },
    { v: 'sleep', em: '😴', t: 'Mieux dormir' },
    { v: 'cook', em: '🍳', t: 'Apprendre à cuisiner' },
    { v: 'budget', em: '💶', t: 'Manger bien sans se ruiner' },
  ],
  daily: [
    { v: 'assis', em: '💻', t: 'Plutôt assis', s: 'bureau, cours, télétravail' },
    { v: 'debout', em: '🚶', t: 'Souvent debout', s: 'je marche pas mal, vendeur, prof…' },
    { v: 'physique', em: '🏗️', t: 'Boulot physique', s: 'chantier, livraison, manutention…' },
  ],
  steps: [
    { v: 'lt5', em: '🐌', t: 'Moins de 5 000' },
    { v: '5to8', em: '🚶', t: '5 000 à 8 000' },
    { v: '8to12', em: '🚶‍♂️', t: '8 000 à 12 000' },
    { v: 'gt12', em: '🏃', t: 'Plus de 12 000' },
    { v: 'unknown', em: '🤷', t: 'Je ne sais pas' },
  ],
  trainFreq: [
    { v: 0, em: '🛋️', t: 'Jamais ou presque' },
    { v: 1, em: '🙂', t: '1 à 2 fois' },
    { v: 2, em: '💪', t: '3 à 4 fois' },
    { v: 3, em: '🔥', t: '5 fois ou plus' },
  ],
  diet: [
    { v: 'omni', em: '🍗', t: 'De tout' },
    { v: 'flexi', em: '🥗', t: 'Peu de viande', s: 'flexitarien' },
    { v: 'pesco', em: '🐟', t: 'Poisson, mais pas de viande' },
    { v: 'vege', em: '🥚', t: 'Végétarien' },
    { v: 'vegan', em: '🌱', t: 'Vegan' },
  ],
  restrictions: [
    { v: 'none', em: '✅', t: 'Aucune', exclusive: true },
    { v: 'halal', em: '🕌', t: 'Halal' },
    { v: 'noPork', em: '🐖', t: 'Sans porc' },
    { v: 'noLactose', em: '🥛', t: 'Sans lactose' },
    { v: 'noGluten', em: '🌾', t: 'Sans gluten' },
    { v: 'noNuts', em: '🥜', t: 'Allergie aux fruits à coque' },
    { v: 'other', em: '⚠️', t: 'Autre', s: 'tu pourras préciser plus loin' },
  ],
  habits: [
    { v: 'petit', em: '🥄', t: 'Petit appétit', s: 'je cale vite', group: 'size' },
    { v: 'gros', em: '🍔', t: 'Gros mangeur', s: "j'aime les grosses assiettes", group: 'size' },
    { v: 'grignote', em: '🍪', t: 'Je grignote entre les repas' },
    { v: 'sweet', em: '🍫', t: "J'ai des envies de sucré" },
    { v: 'late', em: '🌙', t: 'Je mange tard le soir' },
    { v: 'skip', em: '⏭️', t: 'Je saute souvent des repas' },
    { v: 'fast', em: '⏱️', t: 'Je mange vite' },
    { v: 'emotion', em: '😮‍💨', t: 'Je mange quand je suis stressé ou que je m\'ennuie' },
    { v: 'nothing', em: '🙂', t: 'Rien de spécial', exclusive: true },
  ],
  cooking: [
    { v: 'never', em: '🥡', t: 'Presque jamais', s: 'cantine, tout prêt, livraison' },
    { v: 'simple', em: '🍳', t: 'Des trucs simples', s: '15 min max' },
    { v: 'often', em: '👨‍🍳', t: 'Souvent, avec plaisir' },
  ],
  eatPlaces: [
    { v: 'home', em: '🏠', t: 'À la maison' },
    { v: 'canteen', em: '🏫', t: 'Cantine, self, resto U' },
    { v: 'sandwich', em: '🥪', t: 'Sandwich ou boulangerie' },
    { v: 'restaurant', em: '🍽️', t: 'Au resto' },
    { v: 'fastfood', em: '🍟', t: 'Fast-food ou kebab' },
    { v: 'delivery', em: '🛵', t: 'Livraison' },
    { v: 'ready', em: '🥫', t: 'Plats tout prêts' },
  ],
};

// Libellé court d'une réponse (ou d'une liste de réponses)
export function label(key, v) {
  const opts = OPT[key] || [];
  const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const one = (x) => low((opts.find((o) => o.v === x)?.t || '').replace(/^un |^une /, ''));
  if (Array.isArray(v)) return v.map(one).filter(Boolean).join(', ');
  return one(v);
}

// L'appétit utilisé par le calcul des objectifs, déduit des habitudes
export function appetiteFrom(habits = []) {
  if (habits.includes('gros')) return 'gros';
  if (habits.includes('grignote')) return 'grignote';
  if (habits.includes('petit')) return 'petit';
  return 'normal';
}
