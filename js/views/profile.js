// Profil : objectifs, poids, infos perso
import { esc, icons, num, toast, plain, $ } from '../ui.js';
import { getState, setGoals, setProfile } from '../store.js';
import { weightCardHtml, openWeightSheet } from '../weight.js';
import { attachMic, micSvg } from '../voice.js';
import { computeTargets, fmt } from '../nutrition.js';

const LABELS = {
  sex: { m: 'homme', f: 'femme' },
  daily: { assis: 'plutôt assis', debout: 'souvent debout', physique: 'boulot physique' },
  trainFreq: { 0: 'jamais', 1: '1-2 fois / sem.', 2: '3-4 fois / sem.', 3: '5+ fois / sem.' },
  goal: { lose: 'perdre du gras', maintain: 'garder mon poids', gain: 'prendre du muscle' },
  appetite: { petit: 'petit appétit', normal: 'normal', gros: 'gros mangeur', grignote: 'je grignote' },
  steps: { lt5: '< 5 000', '5to8': '5 000 – 8 000', '8to12': '8 000 – 12 000', gt12: '> 12 000', unknown: 'inconnu' },
  diet: { omni: 'de tout', flexi: 'flexitarien', pesco: 'pescétarien', vege: 'végétarien', vegan: 'vegan' },
  cooking: { never: 'presque jamais', simple: 'trucs simples', often: 'souvent' },
};

export function renderProfile(root, ui, nav) {
  const st = getState();
  const p = st.profile || {};
  const g = st.goals || {};
  const meta = st.meta || {};
  root.innerHTML = `
    <header class="topbar">
      <span style="width:42px"></span>
      <div class="head" style="font-size:24px">${p.name ? plain(esc(p.name.toLowerCase())) : 'profil'} ${'<span class="star">✦</span>'}</div>
      <span style="width:42px"></span>
    </header>

    <div class="section center"><span class="pill-label">✦ objectifs du jour ✦</span></div>
    <div class="card section">
      <div class="grid2">
        <div class="field"><label>Calories (kcal)</label><input class="input" id="g-kcal" inputmode="numeric" value="${g.kcal ?? ''}" /></div>
        <div class="field"><label>Protéines (g)</label><input class="input" id="g-prot" inputmode="numeric" value="${g.prot ?? ''}" /></div>
        <div class="field"><label>Glucides (g)</label><input class="input" id="g-carb" inputmode="numeric" value="${g.carb ?? ''}" /></div>
        <div class="field"><label>Lipides (g)</label><input class="input" id="g-fat" inputmode="numeric" value="${g.fat ?? ''}" /></div>
      </div>
      <p class="small muted" id="g-check" style="margin:10px 0 0"></p>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" id="g-auto">recalculer</button>
        <button class="btn btn-primary btn-sm" id="g-save">enregistrer</button>
      </div>
    </div>

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ poids ✦</span></div>
    ${weightCardHtml()}

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ toi ✦</span></div>
    <div class="card section">
      ${[
        ['âge', p.age ? p.age + ' ans' : '–'],
        ['taille', p.height ? p.height + ' cm' : '–'],
        ['poids visé', p.targetWeight ? String(p.targetWeight).replace('.', ',') + ' kg' : '–'],
        ['journée', LABELS.daily[p.daily] || '–'],
        ['pas / jour', LABELS.steps[p.steps] || '–'],
        ['sport', LABELS.trainFreq[p.trainFreq] || '–'],
        ['objectif', LABELS.goal[p.goal] || '–'],
        ['appétit', LABELS.appetite[p.appetite] || '–'],
        ['régime', LABELS.diet[p.diet] || '–'],
        ['repas / jour', p.meals ? (p.meals >= 5 ? '5+' : p.meals) : '–'],
        ['cuisine', LABELS.cooking[p.cooking] || '–'],
      ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('')}
      <div class="about-label">Ta journée type</div>
      <div class="long-input compact"><textarea id="t-day" maxlength="280" placeholder="Raconte ta journée en quelques mots">${esc(p.dayText || '')}</textarea><button type="button" class="mic-btn in-field" id="t-day-mic" aria-label="Dicter">${micSvg}</button><span class="count">${(p.dayText || '').length} / 280</span></div>
      <div class="about-label">Ton entraînement</div>
      <div class="long-input compact"><textarea id="t-train" maxlength="280" placeholder="Décris tes séances, ta marche, ton activité">${esc(p.trainText || '')}</textarea><button type="button" class="mic-btn in-field" id="t-train-mic" aria-label="Dicter">${micSvg}</button><span class="count">${(p.trainText || '').length} / 280</span></div>
      <button class="btn btn-ghost btn-sm" id="t-save" style="margin-top:10px;width:100%" hidden>enregistrer mes réponses</button>
      <button class="btn btn-outline" id="p-redo" style="margin-top:12px">refaire le questionnaire</button>
    </div>
  `;

  $('#p-redo', root).onclick = () => nav.go('#/onboarding');
  $('#w-card', root)?.addEventListener('click', () => openWeightSheet({ onChange: () => nav.render() }));

  // Réponses écrites : modifiables à tout moment
  const tDay = $('#t-day', root), tTrain = $('#t-train', root), tSave = $('#t-save', root);
  attachMic($('#t-day-mic', root), tDay); attachMic($('#t-train-mic', root), tTrain);
  [tDay, tTrain].forEach((ta) => ta.addEventListener('input', () => {
    ta.parentElement.querySelector('.count').textContent = `${ta.value.length} / 280`;
    tSave.hidden = false;
  }));
  tSave.onclick = () => {
    if (!st.profile) return;
    setProfile({ ...st.profile, dayText: tDay.value.trim(), trainText: tTrain.value.trim() });
    tSave.hidden = true;
    toast('réponses enregistrées ✦');
  };

  const gi = (id) => num($('#' + id, root).value);
  const check = () => {
    const k = gi('g-kcal'), pr = gi('g-prot') || 0, c = gi('g-carb') || 0, f = gi('g-fat') || 0;
    const fromMacros = Math.round(pr * 4 + c * 4 + f * 9);
    $('#g-check', root).textContent = k ? `Tes macros font ${fmt(fromMacros)} kcal${Math.abs(fromMacros - k) > 60 ? ' (≠ objectif : ajuste un peu)' : ' ✓'}` : '';
  };
  root.querySelectorAll('#g-kcal,#g-prot,#g-carb,#g-fat').forEach((x) => x.addEventListener('input', check));
  check();

  $('#g-auto', root).onclick = () => {
    if (!st.profile) return nav.go('#/onboarding');
    const t = computeTargets(st.profile);
    $('#g-kcal', root).value = t.kcal; $('#g-prot', root).value = t.prot; $('#g-carb', root).value = t.carb; $('#g-fat', root).value = t.fat;
    check();
  };
  $('#g-save', root).onclick = () => {
    const kcal = gi('g-kcal');
    if (!kcal) return toast('mets au moins les calories');
    setGoals({ ...g, kcal, prot: gi('g-prot') || 0, carb: gi('g-carb') || 0, fat: gi('g-fat') || 0, fiber: Math.round((kcal / 1000) * 14), custom: true });
    toast('objectifs enregistrés ✦');
  };
}
