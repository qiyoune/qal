// Options : apparence, IA, synchro, sauvegarde
import { esc, icons, toast, $ } from '../ui.js';
import { getState, exportData, importData, resetAll } from '../store.js';
import * as drive from '../drive.js';
import { getThemePref, setThemePref } from '../fx.js';
import { getGeminiKey, setGeminiKey, testGeminiKey } from '../ai.js';

export function renderSettings(root, ui, nav) {
  const st = getState();
  const meta = st.meta || {};
  const syncTxt = !drive.isConfigured()
    ? 'Pas encore configurée (voir README).'
    : drive.isConnected()
      ? (meta.lastSync ? 'Dernière synchro : ' + new Date(meta.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Connectée.')
      : 'Retrouve tes données sur tous tes appareils, stockées dans ton propre Google Drive.';
  const renderProfile = renderSettings; // pour les rafraîchissements ci-dessous

  root.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="o-back" aria-label="Retour">${icons.back}</button>
      <div class="head" style="font-size:24px">options <span class="star">✦</span></div>
      <span style="width:42px"></span>
    </header>

    <div class="section center"><span class="pill-label">✦ apparence ✦</span></div>
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
      <p class="small" id="g-err" style="margin:10px 4px 0;color:var(--accent)"></p>
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

  $('#o-back', root).onclick = () => (history.length > 1 ? history.back() : nav.go('#/'));

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
      const why = e.detail ? ` (${e.detail.slice(0, 90)})` : '';
      toast(e.badKey ? 'clé refusée par Google' + why : e.quota ? 'limite gratuite atteinte, réessaie plus tard' : 'test impossible' + (why || ' (connexion ?)'));
      const p = $('#g-err', root); if (p) p.textContent = e.detail ? 'Réponse de Google : ' + e.detail : (e.message || '');
    }
  };
  $('#g-del', root)?.addEventListener('click', () => { setGeminiKey(''); toast('clé retirée'); renderProfile(root, ui, nav); });

  root.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => {
    setThemePref(b.dataset.theme);
    root.querySelectorAll('[data-theme]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  }));

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
