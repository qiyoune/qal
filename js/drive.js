// Synchro via le dossier caché "appDataFolder" du Google Drive de l'utilisateur.
// Les données ne passent par aucun serveur à toi : elles vont directement du téléphone au Drive.
import { GOOGLE_CLIENT_ID } from './config.js';
import { getState, merge, replaceState, setMeta, sameData, changeCount } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'qal-data.json';
const TOKEN_KEY = 'qal:gtoken';
const API = 'https://www.googleapis.com';

let tokenClient = null;
let gisPromise = null;
let syncing = null;

export const isConfigured = () => !!GOOGLE_CLIENT_ID;
export const isConnected = () => !!getState().meta.driveConnected;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = res;
    s.onerror = () => { gisPromise = null; rej(new Error('Impossible de charger Google')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function savedToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.exp > Date.now() + 60_000) return t.token;
  } catch {}
  return null;
}

export const hasValidToken = () => !!savedToken();

// Doit être appelé suite à un tap (sinon Safari bloque la fenêtre Google)
export async function connect({ silent = false } = {}) {
  if (!isConfigured()) throw new Error('Client Google non configuré (voir README)');
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: resp.access_token, exp: Date.now() + (resp.expires_in || 3600) * 1000 }));
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type || 'popup_failed')),
    });
    tokenClient.requestAccessToken({ prompt: silent || isConnected() ? '' : 'consent' });
  });
}

export function disconnect() {
  const t = savedToken();
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
  localStorage.removeItem(TOKEN_KEY);
  setMeta({ driveConnected: false, lastSync: null, remoteStamp: null });
}

async function api(path, opts = {}) {
  const token = savedToken();
  if (!token) { const e = new Error('auth'); e.auth = true; throw e; }
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); const e = new Error('auth'); e.auth = true; throw e; }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}

// Tous les fichiers de données du dossier caché, le plus ancien d'abord.
// Normalement un seul ; deux appareils connectés au même moment peuvent en avoir créé chacun un.
async function listFiles() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,createdTime,modifiedTime)&pageSize=50`);
  const d = await r.json();
  return (d.files || []).sort((x, y) => (x.createdTime || '').localeCompare(y.createdTime || '') || x.id.localeCompare(y.id));
}

async function download(id) {
  const r = await api(`/drive/v3/files/${id}?alt=media`);
  const txt = await r.text();
  if (!txt.trim()) return null; // fichier créé mais jamais rempli
  const d = JSON.parse(txt);
  return d && typeof d === 'object' ? d : null;
}

// Envoie les données, renvoie { id, modifiedTime } du fichier
async function upload(id, data) {
  const body = JSON.stringify(data);
  if (id) {
    const r = await api(`/upload/drive/v3/files/${id}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return r.json();
  }
  const boundary = 'qal' + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await api('/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  return r.json();
}

const stampOf = (files) => files.map((f) => `${f.id}@${f.modifiedTime || ''}`).join('|');

// Ce qu'il y a sur le Drive : les fichiers, et leur contenu (fusionné s'il y en a plusieurs)
async function fetchRemote() {
  const files = await listFiles();
  let data = null;
  for (const f of files) {
    const d = await download(f.id);
    if (d) { const { meta, ...clean } = merge(data, d); data = clean; }
  }
  return { files, data };
}

// Télécharge la version Drive, la combine avec le local selon `mode`, renvoie true.
//   merge  : pour chaque élément, la version la plus récente gagne (synchro normale)
//   remote : les données du Drive remplacent celles de l'appareil
//   mine   : profil, objectifs, repas et réglages de l'appareil + le reste fusionné avec le Drive
// `fetched` : le résultat d'un fetchRemote() déjà fait (première connexion)
export function sync({ mode = 'merge', fetched } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    // Rien de neuf ni ici ni sur le Drive : on s'arrête là (pas de téléchargement)
    if (mode === 'merge' && !fetched) {
      const files = await listFiles();
      const m = getState().meta;
      if (files.length === 1 && !m.dirty && m.remoteStamp === stampOf(files)) { setMeta({ lastSync: Date.now() }); return true; }
    }
    const { files, data: remote } = fetched || await fetchRemote();
    const before = changeCount();
    const local = getState();
    let next = remote && mode === 'remote' ? { ...remote, meta: local.meta } : merge(local, remote);
    if (remote && mode === 'mine') {
      const now = Date.now();
      const keep = (x) => (x ? { ...x, updatedAt: now } : x); // plus récent que tout : gagne aussi sur les autres appareils
      next = { ...next, profile: keep(local.profile), goals: keep(local.goals), mealSlots: keep(local.mealSlots), prefs: local.prefs ? keep(local.prefs) : next.prefs };
    }
    const { meta, ...toUpload } = next;
    let main = files[0] || null;
    // On n'envoie que s'il y a du nouveau pour le Drive (sinon on ne ferait que retarder les autres appareils)
    if (!main || files.length > 1 || !sameData(toUpload, remote)) main = { ...main, ...(await upload(main?.id, toUpload)) };
    // Fichiers en double : leur contenu est maintenant dans le premier, on les retire
    for (const f of files.slice(1)) await api(`/drive/v3/files/${f.id}`, { method: 'DELETE' }).catch((e) => { if (e.auth) throw e; });
    // Des modifs faites pendant l'envoi ? On les garde, et on les enverra à la prochaine synchro.
    const changed = changeCount() !== before;
    const final = changed && mode !== 'remote' ? merge(getState(), next) : next;
    if (changed || !sameData(final, local)) replaceState(final, { fromSync: true });
    setMeta({ lastSync: Date.now(), remoteStamp: stampOf([main]), ...(changed ? {} : { dirty: false }) });
    if (changed) scheduleSync();
    return true;
  })().finally(() => { syncing = null; });
  return syncing;
}

const hasData = (s) => !!(s && (s.profile || ['entries', 'foods', 'recipes', 'weights'].some((k) => Object.values(s[k] || {}).some((e) => !e.deleted))));

// Résumé lisible d'un jeu de données (pour choisir lequel garder)
function summary(s) {
  const entries = Object.values(s.entries || {}).filter((e) => !e.deleted && e.date);
  const days = new Set(entries.map((e) => e.date));
  const last = [...days].sort().pop();
  return { name: s.profile?.name || '', kcal: s.goals?.kcal || null, weight: s.profile?.weight || null, days: days.size, last, updatedAt: s.profile?.updatedAt || null };
}

// Première connexion : si le Drive et l'appareil ont chacun des données, on demande lesquelles garder.
// `choose(drive, device)` renvoie 'remote', 'mine' ou null (annulé). Renvoie le mode appliqué.
export async function firstConnect(choose) {
  await connect();
  try {
    const fetched = await fetchRemote();
    const remote = fetched.data;
    let mode = 'merge';
    if (hasData(remote) && !hasData(getState())) mode = 'remote';
    else if (hasData(remote)) {
      mode = await choose(summary(remote), summary(getState()));
      if (!mode) { const e = new Error('cancel'); e.cancel = true; throw e; }
    }
    await sync({ mode, fetched });
    setMeta({ driveConnected: true });
    return mode;
  } catch (e) {
    disconnect();
    throw e;
  }
}

// Synchro demandée par un tap : si le jeton Google (1 h) a expiré, on le redemande d'abord
export async function syncNow() {
  if (!hasValidToken()) await connect({ silent: true });
  return sync();
}

// Synchro en arrière-plan : seulement si Google est connecté et que le jeton est encore valable
export const canAutoSync = () => isConnected() && hasValidToken();

let timer = null;
let notify = null; // prévenu à la fin de chaque synchro automatique : notify(erreur ou null)
export function onAutoSync(fn) { notify = fn; }
function auto() {
  clearTimeout(timer); timer = null;
  if (!canAutoSync()) return Promise.resolve();
  return sync().then(() => notify?.(null)).catch((e) => notify?.(e));
}
// Après une modif : on attend un peu (plusieurs modifs d'affilée = un seul envoi)
export function scheduleSync() {
  if (!canAutoSync()) return;
  clearTimeout(timer);
  timer = setTimeout(auto, 2500);
}
// L'appli passe en arrière-plan : on envoie tout de suite ce qui attendait
export function flush() { if (timer) auto(); }
// Vérifie s'il y a du nouveau sur le Drive (au retour sur l'appli, puis régulièrement)
export function pull() { if (!timer) auto(); }
