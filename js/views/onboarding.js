// Questionnaire de départ : calcule les objectifs à partir de ton profil
import { esc, icons, num, star, plain, $ } from '../ui.js';
import { computeTargets, tipsFor, fmt } from '../nutrition.js';
import { getState, setProfile, setGoals, setMealSlots, MEALS, MEAL_PRESETS, DEFAULT_MEALS } from '../store.js';
import { OPT, appetiteFrom } from '../answers.js';
import { attachMic, micSvg } from '../voice.js';
import * as drive from '../drive.js';
import { PROVIDERS, getKey, setKey, testKey, getProvider } from '../ai.js';
import { toast } from '../ui.js';

let a = {};      // réponses
let i = 0;       // étape courante

const o = (k) => OPT[k];

const STEPS = [
  /* ---------- Intro ---------- */
  {
    key: 'intro', kind: 'intro', section: '',
    title: () => `on fait connaissance ${star}`,
    sub: "3 minutes pour que tes objectifs et l'IA soient vraiment adaptés à toi : ton corps, ton objectif, ton activité et ta façon de manger. Tes réponses restent sur ton téléphone (et dans ton Google Drive si tu actives la synchro).",
  },

  /* ---------- 1. Toi ---------- */
  { key: 'name', kind: 'text', optional: true, section: 'toi', title: () => "comment tu t'appelles ?", placeholder: 'ton prénom' },
  { key: 'sex', kind: 'choice', section: 'toi', title: () => 'tu es…', sub: 'Ça sert à calculer ta dépense de base.', options: o('sex') },
  {
    key: 'body', kind: 'body', section: 'toi',
    title: () => 'tes mensurations',
    sub: "Pour le poids, le matin à jeun c'est le plus fiable.",
    fields: [
      { key: 'age', label: 'âge', unit: 'ans', min: 13, max: 100 },
      { key: 'height', label: 'taille', unit: 'cm', min: 120, max: 230 },
      { key: 'weight', label: 'poids', unit: 'kg', min: 30, max: 300, decimal: true },
    ],
  },

  /* ---------- 2. Objectif ---------- */
  { key: 'goal', kind: 'choice', section: 'objectif', title: () => 'ton objectif principal ?', sub: 'Celui qui compte pour tes calories.', options: o('goal') },
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
    key: 'extraGoals', kind: 'multi', optional: true, section: 'objectif',
    title: () => 'et en plus, tu aimerais…',
    sub: "Plusieurs choix possibles, ou aucun. L'IA s'en sert pour ses conseils.",
    options: o('extraGoals'),
  },
  {
    key: 'whyText', kind: 'longtext', optional: true, max: 200, section: 'objectif',
    title: () => "qu'est-ce qui te motive ?",
    sub: "Facultatif. L'IA s'en sert pour t'encourager au bon moment.",
    placeholder: "ex : être plus sec cet été, avoir plus d'énergie en cours, reprendre le foot sans être essoufflé",
  },

  /* ---------- 3. Activité ---------- */
  { key: 'daily', kind: 'choice', section: 'activité', title: () => 'ta journée, <em>hors sport</em> ?', options: o('daily') },
  {
    key: 'steps', kind: 'choice', section: 'activité',
    title: () => 'tu fais combien de pas par jour ?',
    sub: "En moyenne. Tu le trouves dans l'app Santé de ton iPhone (Résumé → Pas).",
    options: o('steps'),
  },
  { key: 'trainFreq', kind: 'choice', section: 'activité', title: () => 'tu fais du sport combien de fois par semaine ?', options: o('trainFreq') },
  {
    key: 'trainText', kind: 'longtext', optional: true, max: 280, section: 'activité',
    title: () => (a.trainFreq === 0 ? 'comment tu bouges au quotidien ?' : 'décris ton sport'),
    sub: () => (a.trainFreq === 0 ? 'Marche, vélo, escaliers… tout compte.' : "Le sport, la durée des séances, l'intensité, à quel moment de la journée…"),
    placeholder: () => (a.trainFreq === 0 ? 'ex : pas de sport, mais je marche 30 min par jour et je vais au taf à vélo' : 'ex : muscu 4x/semaine 1h15 le soir en push/pull/legs, foot le dimanche matin'),
  },
  {
    key: 'dayText', kind: 'longtext', optional: true, max: 280, section: 'activité',
    title: () => 'raconte ta journée type',
    sub: 'Facultatif. Ton taf ou tes cours, tes trajets, tes horaires…',
    placeholder: 'ex : étudiant, en cours assis de 9h à 17h, 20 min de marche pour y aller, je bosse au resto le samedi',
  },

  /* ---------- 4. Alimentation ---------- */
  { key: 'diet', kind: 'choice', section: 'alimentation', title: () => 'tu manges plutôt…', options: o('diet') },
  { key: 'restrictions', kind: 'multi', section: 'alimentation', title: () => 'des restrictions ou allergies ?', sub: 'Plusieurs choix possibles.', options: o('restrictions'), empty: ['none'] },
  {
    key: 'mealIds', kind: 'multi', section: 'alimentation',
    title: () => 'tes repas dans la journée',
    sub: "Coche ceux que tu prends en général. Ce sont les cases de ton journal : tu pourras les renommer, en ajouter ou en retirer dans Options.",
    options: () => MEAL_PRESETS.map((m) => ({ v: m.id, em: MEAL_EM[m.id] || '🍽️', t: m.label.charAt(0).toUpperCase() + m.label.slice(1), s: `à partir de ${m.hour} h` })),
    empty: DEFAULT_MEALS.map((m) => m.id),
  },
  {
    key: 'habits', kind: 'multi', section: 'alimentation',
    title: () => 'ce qui te ressemble',
    sub: "Plusieurs choix possibles. Pas de jugement, c'est pour adapter tes objectifs et les conseils.",
    options: o('habits'), empty: ['nothing'],
  },
  { key: 'cooking', kind: 'choice', section: 'alimentation', title: () => 'tu cuisines ?', options: o('cooking') },
  {
    key: 'eatPlaces', kind: 'multi', optional: true, section: 'alimentation',
    title: () => 'tu manges souvent…',
    sub: "Plusieurs choix possibles. L'IA t'aidera à faire les bons choix au resto ou au self.",
    options: o('eatPlaces'),
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

  /* ---------- Après : synchro et IA (facultatif) ---------- */
  {
    key: 'drive', kind: 'drive', section: '', skip: () => skipDrive,
    title: () => 'garde tes données partout',
    sub: "Connecte ton compte Google : ton journal est sauvegardé dans ton propre Google Drive (dans un dossier caché réservé à qal) et tu le retrouves sur tous tes appareils. qal ne voit aucun autre fichier.",
  },
  {
    key: 'ai', kind: 'ai', section: '', skip: () => skipAi,
    title: () => `active l'ia ${star}`,
    sub: "Pour discuter avec l'IA (ajouter un repas en une phrase ou en photo, idées de repas, bilan de la semaine…), colle une clé API. Gemini est gratuit.",
  },
];
let skipDrive = false, skipAi = false, aiProv = 'gemini';

const MEAL_EM = { breakfast: '🥐', brunch: '🍳', lunch: '🍝', snack: '🍎', preworkout: '🍌', postworkout: '🥤', dinner: '🍲', night: '🥛' };

const SECTIONS = ['toi', 'objectif', 'activité', 'alimentation', 'santé'];

const visible = () => STEPS.filter((s) => !s.skip?.());

export function startOnboarding() {
  const p = getState().profile;
  a = p ? { ...p } : { training: [] };
  a.mealIds = MEALS.filter((m) => MEAL_PRESETS.some((x) => x.id === m.id)).map((m) => m.id);
  if (!a.habits && p?.appetite && p.appetite !== 'normal') a.habits = [p.appetite];
  // déjà fait ? on ne redemande pas
  skipDrive = !drive.isConfigured() || drive.isConnected();
  skipAi = Object.keys(PROVIDERS).some((x) => getKey(x));
  aiProv = getProvider();
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
  else if (st.kind === 'drive') body = `<div class="ob-hero">☁️</div><h1>${plain(st.title())}</h1><p class="ob-sub">${st.sub}</p>
      <button class="btn btn-primary" id="ob-drive">${icons.cloud.replace('<svg', '<svg width="18" height="18"')} se connecter avec Google</button>
      <p class="small muted" id="ob-drive-st" style="margin:-8px 4px 0;text-align:center"></p>`;
  else if (st.kind === 'ai') {
    const P = PROVIDERS[aiProv];
    body = `<div class="ob-hero">✦</div><h1>${plain(st.title())}</h1><p class="ob-sub">${st.sub}</p>
      <div class="segmented" id="ob-prov">${Object.entries(PROVIDERS).map(([id, x]) => `<button class="${id === aiProv ? 'on' : ''}" data-prov="${id}">${x.label}</button>`).join('')}</div>
      <div class="field" style="margin:0"><input class="input" id="ob-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="colle ta clé ${P.label} ici" /></div>
      <p class="small muted" style="margin:-8px 4px 0">${P.free ? `Gratuit : crée-la sur <a href="${P.help}" target="_blank" rel="noopener">${P.helpTxt}</a> (« Create API key »).` : `Payant à l'usage (quelques centimes par jour) : crée-la sur <a href="${P.help}" target="_blank" rel="noopener">${P.helpTxt}</a>.`} Elle reste sur ton appareil. Tu pourras la changer dans Options → IA.</p>
      <p class="small" id="ob-key-err" style="margin:-8px 4px 0;color:var(--accent)"></p>`;
  } else {
    const si = SECTIONS.indexOf(st.section);
    const sub = typeof st.sub === 'function' ? st.sub() : st.sub;
    body = `${si >= 0 ? `<div class="ob-section">${si + 1} / ${SECTIONS.length} · ${st.section}</div>` : ''}<h1>${plain(st.title())}</h1>${sub ? `<p class="ob-sub">${sub}</p>` : ''}`;
    if (st.kind === 'longtext') {
      const ph = typeof st.placeholder === 'function' ? st.placeholder() : st.placeholder;
      const v = a[st.key] || '';
      body += `<div class="long-input"><textarea id="ob-in" maxlength="${st.max}" rows="5" placeholder="${esc(ph)}">${esc(v)}</textarea><button type="button" class="mic-btn in-field" id="ob-mic" aria-label="Dicter">${micSvg}</button><span class="count" id="ob-count">${v.length} / ${st.max}</span></div>
        <p class="small muted" style="margin:-12px 4px 0">Tu peux aussi parler : touche le micro.</p>`;
    }
    if (st.kind === 'text') body += `<div class="big-input"><input class="text" id="ob-in" type="text" autocomplete="given-name" placeholder="${esc(st.placeholder)}" value="${esc(a[st.key] || '')}" maxlength="30" /></div>`;
    if (st.kind === 'body') body += `<div class="body-fields">${st.fields.map((f) => `<label class="body-field"><span class="bf-label">${f.label}</span><span class="bf-input"><input data-k="${f.key}" type="text" inputmode="${f.decimal ? 'decimal' : 'numeric'}" placeholder="–" value="${esc(a[f.key] ?? '')}" /><span>${f.unit}</span></span></label>`).join('')}</div>`;
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
  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
  const after = steps.slice(i + 1).length > 0;
  const nextLabel = st.kind === 'result' ? (after ? 'continuer' : `c'est parti ✦`) : st.kind === 'drive' ? 'plus tard' : st.kind === 'ai' ? 'plus tard' : st.kind === 'intro' ? 'commencer' : st.optional && isEmpty(a[st.key]) ? 'passer' : 'continuer';

  root.innerHTML = `
    <div class="ob">
      <div class="ob-top">
        <button class="icon-btn" id="ob-back" ${canBack ? '' : 'style="visibility:hidden"'} aria-label="Retour">${icons.back}</button>
        <div class="ob-progress"><div style="width:${progress}%"></div></div>
      </div>
      <div class="ob-body">${body}</div>
      <div class="ob-foot">${needsNext ? `<button class="btn ${nextLabel === 'plus tard' ? 'btn-ghost' : 'btn-primary'}" id="ob-next">${nextLabel}</button>` : ''}</div>
    </div>`;

  const rerender = () => renderOnboarding(root, done);
  const go = (d) => { i += d; rerender(); window.scrollTo(0, 0); };

  $('#ob-back', root).onclick = () => {
    if (i === 0) return done(false);
    go(-1);
  };

  const bodyIns = [...root.querySelectorAll('[data-k]')];
  bodyIns.forEach((el, k) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (bodyIns[k + 1] || $('#ob-next', root))?.[bodyIns[k + 1] ? 'focus' : 'click'](); } }));
  if (bodyIns.length && !bodyIns[0].value) setTimeout(() => bodyIns[0].focus(), 250);
  const input = $('#ob-in', root);
  if (input) {
    setTimeout(() => input.focus(), 250);
    if (st.kind !== 'longtext') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ob-next', root)?.click(); });
    if (st.optional) input.addEventListener('input', () => { $('#ob-next', root).textContent = input.value.trim() ? 'continuer' : 'passer'; });
    if (st.kind === 'longtext') {
      input.addEventListener('input', () => {
        $('#ob-count', root).textContent = `${input.value.length} / ${st.max}`;
        const nx = $('#ob-next', root); if (nx && st.optional) nx.textContent = input.value.trim() ? 'continuer' : 'passer';
      });
      attachMic($('#ob-mic', root), input);
    }
  }

  root.querySelectorAll('.option').forEach((b) => {
    b.onclick = () => {
      const v = JSON.parse(b.dataset.v);
      if (st.kind === 'multi') {
        const opts = typeof st.options === 'function' ? st.options() : st.options;
        const excl = opts.filter((o) => o.exclusive).map((o) => o.v);
        const group = opts.find((o) => o.v === v)?.group;
        let arr = new Set(a[st.key] || []);
        if (arr.has(v)) arr.delete(v);
        else if (excl.includes(v)) arr = new Set([v]);
        else {
          excl.forEach((x) => arr.delete(x));
          if (group) opts.filter((o) => o.group === group).forEach((o) => arr.delete(o.v)); // ex : petit OU gros appétit
          arr.add(v);
        }
        a[st.key] = [...arr];
        const y = window.scrollY;
        rerender();
        window.scrollTo(0, y);
      } else {
        a[st.key] = v;
        b.classList.add('on');
        setTimeout(() => go(1), 180);
      }
    };
  });

  // Étape synchro Google Drive
  $('#ob-drive', root)?.addEventListener('click', async () => {
    const b = $('#ob-drive', root), stEl = $('#ob-drive-st', root);
    b.disabled = true; stEl.textContent = 'connexion…';
    try {
      await drive.connect();
      stEl.textContent = 'synchronisation…';
      await drive.sync();
      toast('google drive connecté ✦');
      skipDrive = true; // l'étape disparaît de la liste : on reste au même index
      if (after) rerender(); else done(true);
    } catch (e) { b.disabled = false; stEl.textContent = 'Connexion annulée ou impossible. Tu pourras le faire plus tard dans Options.'; }
  });
  // Étape clé IA
  root.querySelectorAll('[data-prov]').forEach((b) => (b.onclick = () => { aiProv = b.dataset.prov; rerender(); }));
  const keyIn = $('#ob-key', root);
  if (keyIn) {
    const nx = $('#ob-next', root);
    keyIn.addEventListener('input', () => { const on = !!keyIn.value.trim(); nx.textContent = on ? 'tester et enregistrer' : 'plus tard'; nx.classList.toggle('btn-primary', on); nx.classList.toggle('btn-ghost', !on); });
    nx.onclick = async () => {
      const k = keyIn.value.trim();
      if (!k) return after ? go(1) : done(true);
      nx.disabled = true; nx.textContent = 'test…';
      try {
        await testKey(aiProv, k);
        setKey(aiProv, k);
        toast(`${PROVIDERS[aiProv].label} activé ✦`);
        done(true);
      } catch (e) {
        nx.disabled = false; nx.textContent = 'tester et enregistrer';
        $('#ob-key-err', root).textContent = e.badKey ? `Clé refusée par ${PROVIDERS[aiProv].who}.${e.detail ? ' ' + e.detail.slice(0, 120) : ''}` : e.quota ? 'Limite atteinte ou plus de crédit, réessaie plus tard.' : 'Test impossible (connexion ?). Tu peux passer et réessayer dans Options.';
      }
    };
  }

  const next = $('#ob-next', root);
  if (next && !keyIn) next.onclick = () => {
    if (st.kind === 'intro') return go(1);
    if (st.kind === 'drive' || st.kind === 'ai') return after ? go(1) : done(true);
    if (st.kind === 'text' || st.kind === 'longtext') { a[st.key] = input.value.trim().slice(0, st.max || 60); return go(1); }
    if (st.kind === 'number') {
      const v = num(input.value);
      if (st.optional && !input.value.trim()) { a[st.key] = null; return go(1); }
      if (v == null || v < st.min || v > st.max) { input.parentElement.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); return; }
      a[st.key] = st.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      return go(1);
    }
    if (st.kind === 'multi') { if (!(a[st.key] || []).length) a[st.key] = st.empty ? [...st.empty] : []; return go(1); }
    if (st.kind === 'body') {
      let ok = true;
      for (const f of st.fields) {
        const el = root.querySelector(`[data-k="${f.key}"]`);
        const v = num(el.value);
        if (v == null || v < f.min || v > f.max) { ok = false; el.closest('.body-field').animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); continue; }
        a[f.key] = f.decimal ? Math.round(v * 10) / 10 : Math.round(v);
      }
      if (ok) go(1);
      return;
    }
    if (st.kind === 'result') {
      a.training = sportsFromText(a.trainText);
      a.appetite = appetiteFrom(a.habits || []);
      // les repas choisis deviennent les cases du journal (on garde les repas perso déjà créés)
      const picked = MEAL_PRESETS.filter((m) => (a.mealIds || []).includes(m.id));
      const custom = MEALS.filter((m) => !MEAL_PRESETS.some((x) => x.id === m.id));
      const slots = [...picked.map((m) => MEALS.find((x) => x.id === m.id) || m), ...custom];
      if (slots.length) setMealSlots(slots);
      a.meals = slots.length || null;
      delete a.body;
      if (a.trainFreq === 0 && !a.training.length) a.training = [];
      if (a.goal === 'maintain') { a.pace = null; a.targetWeight = null; }
      const t = computeTargets(a);
      setProfile(a);
      setGoals({ kcal: t.kcal, prot: t.prot, carb: t.carb, fat: t.fat, fiber: t.fiber, custom: false });
      if (after) go(1); else done(true);
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
