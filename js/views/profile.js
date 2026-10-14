// Profil, objectifs, synchro et sauvegarde
import { esc, icons, num, toast, plain, $ } from '../ui.js';
import { getState, setGoals, exportData, importData, resetAll } from '../store.js';
import { computeTargets, fmt } from '../nutrition.js';
import * as drive from '../drive.js';

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
      <button class="icon-btn" id="p-back" aria-label="Retour">${icons.back}</button>
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
      <button class="btn btn-outline" id="p-redo" style="margin-top:12px">refaire le questionnaire</button>
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

  $('#p-back', root).onclick = () => nav.go('#/');
  $('#p-redo', root).onclick = () => nav.go('#/onboarding');

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
