// Questionnaire de départ : calcule les objectifs à partir de ton profil
import { esc, icons, num, star, plain, $ } from '../ui.js';
import { computeTargets, tipsFor, fmt } from '../nutrition.js';
import { getState, setProfile, setGoals } from '../store.js';

let a = {};      // réponses
let i = 0;       // étape courante

const STEPS = [
  /* ---------- Intro ---------- */
  {
    key: 'intro', kind: 'intro', section: '',
    title: () => `on fait connaissance ${star}`,
    sub: "2 minutes pour que tes objectifs et l'IA soient vraiment adaptés à toi : ton corps, ton objectif, ton activité et ta façon de manger. Tes réponses restent sur ton téléphone (et dans ton Google Drive si tu actives la synchro).",
  },

  /* ---------- 1. Toi ---------- */
  { key: 'name', kind: 'text', optional: true, section: 'toi', title: () => "comment tu t'appelles ?", placeholder: 'ton prénom' },
  {
    key: 'sex', kind: 'choice', section: 'toi',
    title: () => 'tu es…',
    sub: 'Ça sert à calculer ta dépense de base.',
    options: [{ v: 'm', em: '🙋‍♂️', t: 'un homme' }, { v: 'f', em: '🙋‍♀️', t: 'une femme' }],
  },
  { key: 'age', kind: 'number', unit: 'ans', min: 13, max: 100, section: 'toi', title: () => 'tu as quel âge ?' },
  { key: 'height', kind: 'number', unit: 'cm', min: 120, max: 230, section: 'toi', title: () => 'tu mesures combien ?' },
  { key: 'weight', kind: 'number', unit: 'kg', min: 30, max: 300, decimal: true, section: 'toi', title: () => 'et tu pèses combien ?', sub: "Le matin, à jeun, c'est le plus fiable." },

  /* ---------- 2. Objectif ---------- */
  {
    key: 'goal', kind: 'choice', section: 'objectif',
    title: () => 'ton objectif ?',
    options: [
      { v: 'lose', em: '📉', t: 'Perdre du gras' },
      { v: 'maintain', em: '⚖️', t: 'Garder mon poids', s: 'et mieux manger' },
      { v: 'gain', em: '📈', t: 'Prendre du muscle' },
    ],
  },
  {
    key: 'targetWeight', kind: 'number', unit: 'kg', min: 30, max: 300, decimal: true, optional: true, section: 'objectif',
    skip: () => a.goal === 'maintain',
    title: () => 'tu vises quel poids ?',
    sub: "Facultatif. Ça permet d'estimer le temps qu'il faut.",
  },
  {
    key: 'pace', kind: 'choice', section: 'objectif', skip: () => a.goal === 'maintain',
    title: () => 'à quel rythme ?',
    options: () => a.goal === 'lose'
      ? [{ v: 'slow', em: '🐢', t: 'Tranquille', s: '≈ 0,3 à 0,5 kg par semaine, facile à tenir' }, { v: 'fast', em: '🐇', t: 'Soutenu', s: '≈ 0,5 à 0,8 kg par semaine, plus dur' }]
      : [{ v: 'slow', em: '🐢', t: 'Propre', s: 'peu de gras pris, plus lent' }, { v: 'fast', em: '🐇', t: 'Rapide', s: 'plus de poids, un peu plus de gras' }],
  },
  {
    key: 'whyText', kind: 'longtext', optional: true, max: 200, section: 'objectif',
    title: () => "qu'est-ce qui te motive ?",
    sub: "Facultatif. L'IA s'en sert pour t'encourager au bon moment.",
    placeholder: 'ex : être plus sec cet été, avoir plus d\'énergie en cours, reprendre le foot sans être essoufflé',
  },

  /* ---------- 3. Activité ---------- */
  {
    key: 'daily', kind: 'choice', section: 'activité',
    title: () => 'ta journée type, <em>hors sport</em> ?',
    options: [
      { v: 'assis', em: '💻', t: 'Plutôt assis', s: 'bureau, cours, télétravail' },
      { v: 'debout', em: '🚶', t: 'Souvent debout', s: 'je marche pas mal, vendeur, prof…' },
      { v: 'physique', em: '🏗️', t: 'Boulot physique', s: 'chantier, livraison, manutention…' },
    ],
  },
  {
    key: 'steps', kind: 'choice', section: 'activité',
    title: () => 'tu fais combien de pas par jour ?',
    sub: "Regarde dans l'app Santé de ton iPhone (onglet Résumé → Pas), en moyenne.",
    options: [
      { v: 'lt5', em: '🐌', t: 'Moins de 5 000' },
      { v: '5to8', em: '🚶', t: '5 000 à 8 000' },
      { v: '8to12', em: '🚶‍♂️', t: '8 000 à 12 000' },
      { v: 'gt12', em: '🏃', t: 'Plus de 12 000' },
      { v: 'unknown', em: '🤷', t: 'Je ne sais pas' },
    ],
  },
  {
    key: 'dayText', kind: 'longtext', optional: true, max: 280, section: 'activité',
    title: () => 'raconte ta journée type',
    sub: 'Ton taf ou tes cours, tes trajets, tes horaires, quand tu manges…',
    placeholder: 'ex : étudiant, en cours assis de 9h à 17h, 20 min de marche pour y aller, je bosse debout au resto le samedi',
  },
  {
    key: 'trainFreq', kind: 'choice', section: 'activité',
    title: () => "tu t'entraînes combien de fois par semaine ?",
    options: [
      { v: 0, em: '🛋️', t: 'Jamais ou presque' },
      { v: 1, em: '🙂', t: '1 à 2 fois' },
      { v: 2, em: '💪', t: '3 à 4 fois' },
      { v: 3, em: '🔥', t: '5 fois ou plus' },
    ],
  },
  {
    key: 'trainText', kind: 'longtext', optional: true, max: 280, section: 'activité',
    title: () => 'décris ton sport, si tu en fais un',
    sub: () => (a.trainFreq === 0 ? 'Et sinon, comment tu bouges : marche, vélo, escaliers… tout compte.' : 'Le sport, la durée des séances, l\'intensité, à quel moment de la journée…'),
    placeholder: () => (a.trainFreq === 0 ? 'ex : pas de sport, mais je marche 30 min par jour et je vais au taf à vélo' : 'ex : muscu 4x/semaine 1h15 le soir en push/pull/legs, foot le dimanche matin'),
  },

  /* ---------- 4. Alimentation ---------- */
  {
    key: 'diet', kind: 'choice', section: 'alimentation',
    title: () => 'tu manges plutôt…',
    options: [
      { v: 'omni', em: '🍗', t: 'De tout' },
      { v: 'flexi', em: '🥗', t: 'Peu de viande', s: 'flexitarien' },
      { v: 'pesco', em: '🐟', t: 'Poisson mais pas de viande' },
      { v: 'vege', em: '🥚', t: 'Végétarien' },
      { v: 'vegan', em: '🌱', t: 'Vegan' },
    ],
  },
  {
    key: 'restrictions', kind: 'multi', section: 'alimentation',
    title: () => 'des restrictions ou allergies ?',
    sub: 'Plusieurs choix possibles.',
    options: [
      { v: 'none', em: '✅', t: 'Aucune', exclusive: true },
      { v: 'halal', em: '🕌', t: 'Halal' },
      { v: 'noPork', em: '🐖', t: 'Sans porc' },
      { v: 'noLactose', em: '🥛', t: 'Sans lactose' },
      { v: 'noGluten', em: '🌾', t: 'Sans gluten' },
      { v: 'noNuts', em: '🥜', t: 'Allergie aux fruits à coque' },
      { v: 'other', em: '⚠️', t: 'Autre', s: 'précise plus loin' },
    ],
  },
  {
    key: 'meals', kind: 'choice', section: 'alimentation',
    title: () => 'tu manges combien de fois par jour ?',
    sub: 'Collations comprises, en général.',
    options: [
      { v: 2, em: '2️⃣', t: '2 fois', s: 'je saute souvent un repas' },
      { v: 3, em: '3️⃣', t: '3 fois' },
      { v: 4, em: '4️⃣', t: '4 fois', s: '3 repas + 1 collation' },
      { v: 5, em: '5️⃣', t: '5 fois ou plus' },
    ],
  },
  {
    key: 'appetite', kind: 'choice', section: 'alimentation',
    title: () => 'et ton appétit ?',
    sub: "Pas de jugement, c'est pour adapter tes objectifs.",
    options: [
      { v: 'petit', em: '🥄', t: 'Petit appétit', s: 'je cale vite' },
      { v: 'normal', em: '🍽️', t: 'Normal' },
      { v: 'gros', em: '🍔', t: 'Gros mangeur', s: "j'aime les grosses assiettes" },
      { v: 'grignote', em: '🍪', t: 'Je grignote beaucoup' },
    ],
  },
  {
    key: 'cooking', kind: 'choice', section: 'alimentation',
    title: () => 'tu cuisines ?',
    options: [
      { v: 'never', em: '🥡', t: 'Presque jamais', s: 'cantine, tout prêt, livraison' },
      { v: 'simple', em: '🍳', t: 'Des trucs simples', s: '15 min max' },
      { v: 'often', em: '👨‍🍳', t: 'Souvent, avec plaisir' },
    ],
  },
  {
    key: 'foodText', kind: 'longtext', optional: true, max: 280, section: 'alimentation',
    title: () => "ce que tu aimes, ce que tu n'aimes pas",
    sub: "Tes plats préférés, ce que tu détestes, ce qui te fait craquer… L'IA s'en sert pour ses idées de repas.",
    placeholder: 'ex : fan de riz, poulet, pâtes et skyr, je déteste le poisson, je craque sur le chocolat le soir',
  },

  /* ---------- 5. Santé ---------- */
  {
    key: 'healthText', kind: 'longtext', optional: true, max: 280, section: 'santé',
    title: () => 'un truc à savoir côté santé ?',
    sub: "Facultatif : blessure, diabète, grossesse, traitement… L'IA en tient compte pour ne pas te conseiller à côté. Ça ne remplace pas un médecin.",
    placeholder: 'ex : rien de spécial / tendinite au genou / diabète de type 1',
  },

  { key: 'result', kind: 'result', section: '' },
];

const SECTIONS = ['toi', 'objectif', 'activité', 'alimentation', 'santé'];

const visible = () => STEPS.filter((s) => !s.skip?.());

export function startOnboarding() {
  const p = getState().profile;
  a = p ? { ...p } : { training: [] };
  i = 0;
}

export function renderOnboarding(root, done) {
  const steps = visible();
  if (i >= steps.length) i = steps.length - 1;
  const st = steps[i];
  const progress = Math.round(((i + 1) / steps.length) * 100);
  const canBack = i > 0 || !!getState().profile;

  let body = '';
  if (st.kind === 'result') body = resultHtml();
  else {
    const si = SECTIONS.indexOf(st.section);
    const sub = typeof st.sub === 'function' ? st.sub() : st.sub;
    body = `${si >= 0 ? `<div class="ob-section">${si + 1} / ${SECTIONS.length} · ${st.section}</div>` : ''}<h1>${plain(st.title())}</h1>${sub ? `<p class="ob-sub">${sub}</p>` : ''}`;
    if (st.kind === 'longtext') {
      const ph = typeof st.placeholder === 'function' ? st.placeholder() : st.placeholder;
      const v = a[st.key] || '';
      body += `<div class="long-input"><textarea id="ob-in" maxlength="${st.max}" rows="5" placeholder="${esc(ph)}">${esc(v)}</textarea><span class="count" id="ob-count">${v.length} / ${st.max}</span></div>`;
    }
    if (st.kind === 'text') body += `<div class="big-input"><input class="text" id="ob-in" type="text" autocomplete="given-name" placeholder="${esc(st.placeholder)}" value="${esc(a[st.key] || '')}" maxlength="30" /></div>`;
    if (st.kind === 'number') body += `<div class="big-input"><input id="ob-in" type="text" inputmode="${st.decimal ? 'decimal' : 'numeric'}" placeholder="0" value="${esc(a[st.key] ?? '')}" /><span>${st.unit}</span></div>`;
    if (st.kind === 'choice' || st.kind === 'multi') {
      const opts = typeof st.options === 'function' ? st.options() : st.options;
      body += `<div class="options">${opts.map((o) => {
        const on = st.kind === 'multi' ? (a[st.key] || []).includes(o.v) : a[st.key] === o.v;
        return `<button class="option ${on ? 'on' : ''}" data-v='${JSON.stringify(o.v)}'><span class="em">${o.em}</span><span><div class="t">${o.t}</div>${o.s ? `<div class="s">${o.s}</div>` : ''}</span><span class="check">${on ? icons.check.replace('<svg', '<svg width="13" height="13"') : ''}</span></button>`;
      }).join('')}</div>`;
    }
  }

  const needsNext = st.kind !== 'choice';
  const nextLabel = st.kind === 'result' ? `c'est parti ✦` : st.kind === 'intro' ? 'commencer' : st.optional && (a[st.key] == null || a[st.key] === '') ? 'passer' : 'continuer';

  root.innerHTML = `
    <div class="ob">
      <div class="ob-top">
        <button class="icon-btn" id="ob-back" ${canBack ? '' : 'style="visibility:hidden"'} aria-label="Retour">${icons.back}</button>
        <div class="ob-progress"><div style="width:${progress}%"></div></div>
      </div>
      <div class="ob-body">${body}</div>
      <div class="ob-foot">${needsNext ? `<button class="btn btn-primary" id="ob-next">${nextLabel}</button>` : ''}</div>
    </div>`;

  const rerender = () => renderOnboarding(root, done);
  const go = (d) => { i += d; rerender(); window.scrollTo(0, 0); };

  $('#ob-back', root).onclick = () => {
    if (i === 0) return done(false);
    go(-1);
  };

  const input = $('#ob-in', root);
  if (input) {
    setTimeout(() => input.focus(), 250);
    if (st.kind !== 'longtext') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ob-next', root)?.click(); });
    if (st.optional) input.addEventListener('input', () => { $('#ob-next', root).textContent = input.value.trim() ? 'continuer' : 'passer'; });
    if (st.kind === 'longtext') input.addEventListener('input', () => { $('#ob-count', root).textContent = `${input.value.length} / ${st.max}`; });
  }

  root.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      const v = JSON.parse(b.dataset.v);
      if (st.kind === 'multi') {
        const opts = typeof st.options === 'function' ? st.options() : st.options;
        const excl = opts.filter((o) => o.exclusive).map((o) => o.v);
        let arr = new Set(a[st.key] || []);
        if (arr.has(v)) arr.delete(v);
        else if (excl.includes(v)) arr = new Set([v]);
        else { excl.forEach((x) => arr.delete(x)); arr.add(v); }
        a[st.key] = [...arr];
        rerender();
      } else {
        a[st.key] = v;
        b.classList.add('on');
        setTimeout(() => go(1), 180);
      }
    };
  });

  const next = $('#ob-next', root);
  if (next) next.onclick = () => {
    if (st.kind === 'intro') return go(1);
    if (st.kind === 'text' || st.kind === 'longtext') { a[st.key] = input.value.trim().slice(0, st.max || 60); return go(1); }
    if (st.kind === 'number') {
      const v = num(input.value);
      if (st.optional && !input.value.trim()) { a[st.key] = null; return go(1); }
      if (v == null || v < st.min || v > st.max) { input.parentElement.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; }
      a[st.key] = st.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      return go(1);
    }
    if (st.kind === 'multi') { if (!(a[st.key] || []).length) a[st.key] = st.key === 'restrictions' ? ['none'] : ['autre']; return go(1); }
    if (st.kind === 'result') {
      a.training = sportsFromText(a.trainText);
      if (a.trainFreq === 0 && !a.training.length) a.training = [];
      if (a.goal === 'maintain') { a.pace = null; a.targetWeight = null; }
      const t = computeTargets(a);
      setProfile(a);
      setGoals({ kcal: t.kcal, prot: t.prot, carb: t.carb, fat: t.fat, fiber: t.fiber, custom: false });
      done(true);
    }
  };
}

function resultHtml() {
  const t = computeTargets(a);
  const tips = tipsFor(a);
  const goalTxt = { lose: 'pour perdre du gras', maintain: 'pour garder ton poids', gain: 'pour prendre du muscle' }[a.goal];
  return `
    <div class="result-hero">
      <span class="pill-label">✦ ton objectif ✦</span>
      <h1 style="margin-top:14px">${plain(a.name ? esc(a.name.toLowerCase()) + ', voila' : 'voila')} ton plan</h1>
      <div class="num" style="margin-top:14px">${fmt(t.kcal)}</div>
      <div class="muted">kcal par jour ${goalTxt}</div>
    </div>
    <div class="macros" style="margin-top:0">
      <div class="macro"><div class="name">protéines</div><div class="val">${t.prot}<small> g</small></div></div>
      <div class="macro"><div class="name">glucides</div><div class="val">${t.carb}<small> g</small></div></div>
      <div class="macro"><div class="name">lipides</div><div class="val">${t.fat}<small> g</small></div></div>
    </div>
    <div class="card explain">
      <b>Comment c'est calculé</b>
      <ul style="padding-left:18px;margin:8px 0 0">
        <li>Dépense au repos : <b>${fmt(t.bmr)} kcal</b> (formule de Mifflin-St Jeor)</li>
        <li>Avec ton activité (×${String(t.factor).replace('.', ',')}) : <b>${fmt(t.tdee)} kcal</b> pour être stable</li>
        <li>Protéines : ${String(t.protPerKg.toFixed(1)).replace('.', ',')} g par kg de poids</li>
        ${t.weeks ? `<li>Objectif ${String(a.targetWeight).replace('.', ',')} kg : environ <b>${t.weeks} semaines</b> à ce rythme</li>` : ''}
      </ul>
      <p class="small muted" style="margin:10px 0 0">C'est une estimation de départ : ajuste après 2-3 semaines selon l'évolution de ton poids. Tu peux tout modifier dans ton profil.</p>
    </div>
    ${tips.map((x) => `<div class="tip">✦ ${esc(x)}</div>`).join('')}`;
}

// Déduit le type de sport à partir de ce que la personne a écrit (sert au calcul des protéines)
function sportsFromText(t = '') {
  const n = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const out = [];
  if (/muscu|musculation|street ?workout|calisthenics|crossfit|salle|fitness|powerlifting|halt[eè]ro|bodybuilding|ppl|push|pull/.test(n)) out.push('muscu');
  if (/course|courir|running|footing|jogging|cardio|velo|cyclisme|natation|nage|rameur|marathon|trail/.test(n)) out.push('cardio');
  if (/foot|basket|hand|rugby|volley|tennis|padel|boxe|mma|judo|karate|lutte|jjb|combat|kick/.test(n)) out.push('sportco');
  return out;
}
