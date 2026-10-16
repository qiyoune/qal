// Profil, objectifs, synchro et sauvegarde
import { esc, icons, num, toast, plain, $ } from '../ui.js';
import { getState, setGoals, setProfile, exportData, importData, resetAll } from '../store.js';
import { computeTargets, fmt } from '../nutrition.js';
import * as drive from '../drive.js';
import { getThemePref, setThemePref } from '../fx.js';
import { getGeminiKey, setGeminiKey, testGeminiKey } from '../ai.js';

const LABELS = {
  sex: { m: 'homme', f: 'femme' },
  daily: { assis: 'plutôt assis', debout: 'souvent debout', physique: 'boulot physique' },
  trainFreq: { 0: 'jamais', 1: '1-2 fois / sem.', 2: '3-4 fois / sem.', 3: '5+ fois / sem.' },
  goal: { lose: 'perdre du gras', maintain: 'garder mon poids', gain: 'prendre du muscle' },
  appetite: { petit: 'petit appétit', normal: 'normal', gros: 'gros mangeur', grignote: 'je grignote' },
};

export function renderProfile(root, ui, nav) {
  const st = getState();
  const p = st.profile || {};
  const g = st.goals || {};
  const meta = st.meta || {};
  const syncTxt = !drive.isConfigured()
    ? 'Pas encore configurée (voir README).'
    : drive.isConnected()
      ? (meta.lastSync ? 'Dernière synchro : ' + new Date(meta.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Connectée.')
      : 'Retrouve tes données sur tous tes appareils, stockées dans ton propre Google Drive.';

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

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ toi ✦</span></div>
    <div class="card section">
      ${[
        ['âge', p.age ? p.age + ' ans' : '–'],
        ['taille', p.height ? p.height + ' cm' : '–'],
        ['poids', p.weight ? String(p.weight).replace('.', ',') + ' kg' : '–'],
        ['journée', LABELS.daily[p.daily] || '–'],
        ['sport', LABELS.trainFreq[p.trainFreq] || '–'],
        ['objectif', LABELS.goal[p.goal] || '–'],
        ['appétit', LABELS.appetite[p.appetite] || '–'],
      ].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join('')}
      <div class="about-label">Ta journée type</div>
      <div class="long-input compact"><textarea id="t-day" maxlength="280" placeholder="Raconte ta journée en quelques mots">${esc(p.dayText || '')}</textarea><span class="count">${(p.dayText || '').length} / 280</span></div>
      <div class="about-label">Ton entraînement</div>
      <div class="long-input compact"><textarea id="t-train" maxlength="280" placeholder="Décris tes séances, ta marche, ton activité">${esc(p.trainText || '')}</textarea><span class="count">${(p.trainText || '').length} / 280</span></div>
      <button class="btn btn-ghost btn-sm" id="t-save" style="margin-top:10px;width:100%" hidden>enregistrer mes réponses</button>
      <button class="btn btn-outline" id="p-redo" style="margin-top:12px">refaire le questionnaire</button>
    </div>

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ apparence ✦</span></div>
    <div class="card section">
      <div class="segmented" id="theme-seg" role="radiogroup" aria-label="Thème">
        ${[['auto', 'auto'], ['light', 'clair'], ['dark', 'sombre']].map(([v, l]) => `<button role="radio" aria-checked="${getThemePref() === v}" class="${getThemePref() === v ? 'on' : ''}" data-theme="${v}">${l}</button>`).join('')}
      </div>
      <p class="small muted" style="margin:10px 4px 0">Auto suit le réglage clair / sombre de ton iPhone. En clair, le fond change de teinte selon le moment de la journée.</p>
    </div>

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ ia ✦</span></div>
    <div class="card section">
      <div class="sync-status"><span class="dot ${getGeminiKey() ? 'ok' : ''}"></span><span>${getGeminiKey() ? 'Clé Gemini enregistrée : le chat IA est actif.' : 'Ajoute ta clé Gemini gratuite pour activer le chat IA.'}</span></div>
      <div class="field" style="margin-top:14px">
        <label for="g-key">Clé API Gemini</label>
        <input class="input" id="g-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${getGeminiKey() ? '•••••••• (enregistrée)' : 'colle ta clé ici'}" />
      </div>
      <div class="row" style="margin-top:10px">
        ${getGeminiKey() ? '<button class="btn btn-ghost btn-sm" id="g-del">retirer</button>' : ''}
        <button class="btn btn-primary btn-sm" id="g-save-key">enregistrer</button>
      </div>
      <p class="small muted" style="margin:12px 4px 0">Gratuit : crée ta clé sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (bouton « Create API key »), puis colle-la ici. Elle reste uniquement sur ce téléphone. Avec l'offre gratuite, Google peut utiliser les conversations pour améliorer ses modèles.</p>
    </div>

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ synchro ✦</span></div>
    <div class="card section">
      <div class="sync-status"><span class="dot ${drive.isConnected() ? (drive.hasValidToken() ? 'ok' : 'err') : ''}"></span><span>${syncTxt}</span></div>
      <div class="stack" style="margin-top:14px">
        ${!drive.isConfigured() ? '' : drive.isConnected()
          ? `<button class="btn btn-primary" id="s-now">${icons.cloud.replace('<svg', '<svg width="18" height="18"')} synchroniser maintenant</button><button class="btn btn-ghost btn-sm" id="s-off" style="width:100%">déconnecter Google</button>`
          : `<button class="btn btn-primary" id="s-on">se connecter avec Google</button>`}
      </div>
    </div>

    <div class="section center" style="margin-top:26px"><span class="pill-label">✦ sauvegarde ✦</span></div>
    <div class="card section stack">
      <button class="btn btn-ghost" id="b-export">exporter mes données</button>
      <label class="btn btn-ghost" style="cursor:pointer">importer une sauvegarde<input type="file" id="b-import" accept="application/json,.json" hidden /></label>
      <button class="btn btn-danger" id="b-reset">tout effacer</button>
    </div>

    <p class="credits section center">
      qal ✦ — fait par <a href="https://qiyoune.com" target="_blank" rel="noopener">qiyoune</a><br>
      Produits : <a href="https://fr.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (licence ODbL) ·
      Aliments bruts : <a href="https://ciqual.anses.fr" target="_blank" rel="noopener">table Ciqual 2020, ANSES</a> (Licence Ouverte)<br>
      Les objectifs sont des estimations, pas un avis médical.
    </p>`;

  $('#p-redo', root).onclick = () => nav.go('#/onboarding');

  // Clé Gemini
  $('#g-save-key', root).onclick = async () => {
    const k = $('#g-key', root).value.trim();
    if (!k) return toast(getGeminiKey() ? 'clé déjà enregistrée' : 'colle ta clé d\'abord');
    const btn = $('#g-save-key', root);
    btn.disabled = true; btn.textContent = 'test…';
    try {
      await testGeminiKey(k);
      setGeminiKey(k);
      toast('clé validée, l\'ia est active ✦');
      renderProfile(root, ui, nav);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'enregistrer';
      toast(e.badKey ? 'clé refusée par Google' : e.quota ? 'limite gratuite atteinte, réessaie plus tard' : 'impossible de tester la clé (connexion ?)');
    }
  };
  $('#g-del', root)?.addEventListener('click', () => { setGeminiKey(''); toast('clé retirée'); renderProfile(root, ui, nav); });

  root.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => {
    setThemePref(b.dataset.theme);
    root.querySelectorAll('[data-theme]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  }));

  // Réponses écrites : modifiables à tout moment
  const tDay = $('#t-day', root), tTrain = $('#t-train', root), tSave = $('#t-save', root);
  [tDay, tTrain].forEach((ta) => ta.addEventListener('input', () => {
    ta.nextElementSibling.textContent = `${ta.value.length} / 280`;
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

  // Synchro
  const doSync = async () => {
    try {
      if (!drive.hasValidToken()) await drive.connect({ silent: true });
      await drive.sync();
      toast('synchronisé ✦');
    } catch (e) {
      console.warn(e);
      toast(e.auth ? 'reconnecte-toi à Google' : 'synchro impossible');
    }
    renderProfile(root, ui, nav);
  };
  $('#s-on', root)?.addEventListener('click', async () => {
    try { await drive.connect(); await doSync(); } catch (e) { toast('connexion annulée'); }
  });
  $('#s-now', root)?.addEventListener('click', doSync);
  $('#s-off', root)?.addEventListener('click', () => { drive.disconnect(); toast('déconnecté'); renderProfile(root, ui, nav); });

  // Sauvegarde
  $('#b-export', root).onclick = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qal-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#b-import', root).onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { importData(JSON.parse(await file.text())); toast('sauvegarde importée ✦'); renderProfile(root, ui, nav); }
    catch { toast('fichier invalide'); }
  };
  $('#b-reset', root).onclick = () => {
    if (!confirm('Effacer toutes tes données sur cet appareil ?')) return;
    resetAll();
    nav.go('#/onboarding');
  };
}
