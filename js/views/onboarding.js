// Questionnaire de départ : calcule les objectifs à partir de ton profil
import { esc, icons, num, star, plain, $ } from '../ui.js';
import { computeTargets, tipsFor, fmt } from '../nutrition.js';
import { getState, setProfile, setGoals } from '../store.js';

let a = {};      // réponses
let i = 0;       // étape courante

const STEPS = [
  {
    key: 'name', kind: 'text', optional: true,
    title: () => `salut ${star}<br>comment tu t'appelles ?`,
    sub: 'Juste pour que ce soit plus sympa.',
    placeholder: 'ton prénom',
  },
  {
    key: 'sex', kind: 'choice',
    title: () => 'tu es…',
    sub: 'Ça sert uniquement à calculer ta dépense de base.',
    options: [
      { v: 'm', em: '🙋‍♂️', t: 'un homme' },
      { v: 'f', em: '🙋‍♀️', t: 'une femme' },
    ],
  },
  { key: 'age', kind: 'number', unit: 'ans', min: 13, max: 100, title: () => 'tu as quel âge ?' },
  { key: 'height', kind: 'number', unit: 'cm', min: 120, max: 230, title: () => 'tu mesures combien ?' },
  { key: 'weight', kind: 'number', unit: 'kg', min: 30, max: 300, decimal: true, title: () => 'et tu pèses combien ?', sub: 'Le matin, à jeun, c\'est le plus fiable.' },
  {
    key: 'daily', kind: 'choice',
    title: () => 'ta journée type, <em>hors sport</em> ?',
    options: [
      { v: 'assis', em: '💻', t: 'Plutôt assis', s: 'bureau, cours, télétravail' },
      { v: 'debout', em: '🚶', t: 'Souvent debout', s: 'je marche pas mal, vendeur, prof…' },
      { v: 'physique', em: '🏗️', t: 'Boulot physique', s: 'chantier, livraison, manutention…' },
    ],
  },
  {
    key: 'trainFreq', kind: 'choice',
    title: () => 'tu t\'entraînes combien de fois par semaine ?',
    options: [
      { v: 0, em: '🛋️', t: 'Jamais ou presque' },
      { v: 1, em: '🙂', t: '1 à 2 fois' },
      { v: 2, em: '💪', t: '3 à 4 fois' },
      { v: 3, em: '🔥', t: '5 fois ou plus' },
    ],
  },
  {
    key: 'training', kind: 'multi', skip: () => a.trainFreq === 0,
    title: () => 'tu fais quoi comme sport ?',
    sub: 'Plusieurs choix possibles.',
    options: [
      { v: 'muscu', em: '🏋️', t: 'Muscu / street workout' },
      { v: 'cardio', em: '🏃', t: 'Course, cardio, vélo' },
      { v: 'sportco', em: '⚽', t: 'Sport co ou combat' },
      { v: 'autre', em: '🧘', t: 'Autre', s: 'natation, danse, escalade…' },
    ],
  },
  {
    key: 'goal', kind: 'choice',
    title: () => 'ton objectif ?',
    options: [
      { v: 'lose', em: '📉', t: 'Perdre du gras' },
      { v: 'maintain', em: '⚖️', t: 'Garder mon poids', s: 'et manger mieux' },
      { v: 'gain', em: '📈', t: 'Prendre du muscle' },
    ],
  },
  {
    key: 'pace', kind: 'choice', skip: () => a.goal === 'maintain',
    title: () => 'à quel rythme ?',
    options: () => a.goal === 'lose'
      ? [{ v: 'slow', em: '🐢', t: 'Tranquille', s: '≈ 0,3 à 0,5 kg / semaine, facile à tenir' }, { v: 'fast', em: '🐇', t: 'Soutenu', s: '≈ 0,5 à 0,8 kg / semaine, plus dur' }]
      : [{ v: 'slow', em: '🐢', t: 'Propre', s: 'peu de gras pris, plus lent' }, { v: 'fast', em: '🐇', t: 'Rapide', s: 'plus de poids, un peu plus de gras' }],
  },
  {
    key: 'appetite', kind: 'choice',
    title: () => 'et toi, la bouffe ?',
    sub: 'Pas de jugement, c\'est pour adapter tes objectifs.',
    options: [
      { v: 'petit', em: '🥄', t: 'Petit appétit', s: 'je cale vite' },
      { v: 'normal', em: '🍽️', t: 'Normal' },
      { v: 'gros', em: '🍔', t: 'Gros mangeur', s: "j'aime les grosses assiettes" },
      { v: 'grignote', em: '🍪', t: 'Je grignote beaucoup' },
    ],
  },
  { key: 'result', kind: 'result' },
];

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
    body = `<h1>${plain(st.title())}</h1>${st.sub ? `<p class="ob-sub">${st.sub}</p>` : ''}`;
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
  const nextLabel = st.kind === 'result' ? `c'est parti ✦` : st.optional && !a[st.key] ? 'passer' : 'continuer';

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
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ob-next', root)?.click(); });
    if (st.optional) input.addEventListener('input', () => { $('#ob-next', root).textContent = input.value.trim() ? 'continuer' : 'passer'; });
  }

  root.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      const v = JSON.parse(b.dataset.v);
      if (st.kind === 'multi') {
        const arr = new Set(a[st.key] || []);
        arr.has(v) ? arr.delete(v) : arr.add(v);
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
    if (st.kind === 'text') { a[st.key] = input.value.trim(); return go(1); }
    if (st.kind === 'number') {
      const v = num(input.value);
      if (v == null || v < st.min || v > st.max) { input.parentElement.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; }
      a[st.key] = st.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      return go(1);
    }
    if (st.kind === 'multi') { if (!(a[st.key] || []).length) a[st.key] = ['autre']; return go(1); }
    if (st.kind === 'result') {
      if (a.trainFreq === 0) a.training = [];
      if (a.goal === 'maintain') a.pace = null;
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
      </ul>
      <p class="small muted" style="margin:10px 0 0">C'est une estimation de départ : ajuste après 2-3 semaines selon l'évolution de ton poids. Tu peux tout modifier dans ton profil.</p>
    </div>
    ${tips.map((x) => `<div class="tip">✦ ${esc(x)}</div>`).join('')}`;
}
