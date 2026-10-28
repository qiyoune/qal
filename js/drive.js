// Synchro via le dossier caché "appDataFolder" du Google Drive de l'utilisateur.
// Les données ne passent par aucun serveur à toi : elles vont directement du téléphone au Drive.
import { GOOGLE_CLIENT_ID } from './config.js';
import { getState, merge, replaceState, setMeta } from './store.js';

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
  setMeta({ driveConnected: false, lastSync: null });
}

async function api(path, opts = {}) {
  const token = savedToken();
  if (!token) { const e = new Error('auth'); e.auth = true; throw e; }
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); const e = new Error('auth'); e.auth = true; throw e; }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=10`);
  const d = await r.json();
  return d.files?.[0] || null;
}

async function download(id) {
  const r = await api(`/drive/v3/files/${id}?alt=media`);
  return r.json();
}

async function upload(id, data) {
  const body = JSON.stringify(data);
  if (id) {
    await api(`/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return id;
  }
  const boundary = 'qal' + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await api('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  return (await r.json()).id;
}

// Télécharge la version Drive, la combine avec le local selon `mode`, renvoie le résultat.
//   merge  : pour chaque élément, la version la plus récente gagne (synchro normale)
//   remote : les données du Drive remplacent celles de l'appareil
//   mine   : profil, objectifs et repas de l'appareil + journal fusionné avec le Drive
export function sync({ mode = 'merge', remote: given } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    const file = await findFile();
    const remote = given !== undefined ? given : file ? await download(file.id) : null;
    const local = getState();
    let next = remote && mode === 'remote' ? { ...remote, meta: local.meta } : merge(local, remote);
    if (remote && mode === 'mine') {
      const now = Date.now();
      const keep = (x) => (x ? { ...x, updatedAt: now } : x); // plus récent que tout : gagne aussi sur les autres appareils
      next = { ...next, profile: keep(local.profile), goals: keep(local.goals), mealSlots: keep(local.mealSlots) };
    }
    const { meta, ...toUpload } = next;
    await upload(file?.id, toUpload);
    replaceState(next, { fromSync: true });
    setMeta({ lastSync: Date.now() });
    return true;
  })().finally(() => { syncing = null; });
  return syncing;
}

const hasData = (s) => !!(s && (s.profile || Object.values(s.entries || {}).some((e) => !e.deleted)));

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
    const file = await findFile();
    const remote = file ? await download(file.id) : null;
    let mode = 'merge';
    if (hasData(remote) && !hasData(getState())) mode = 'remote';
    else if (hasData(remote)) {
      mode = await choose(summary(remote), summary(getState()));
      if (!mode) { const e = new Error('cancel'); e.cancel = true; throw e; }
    }
    await sync({ mode, remote });
    setMeta({ driveConnected: true });
    return mode;
  } catch (e) {
    disconnect();
    throw e;
  }
}

let timer = null;
export function scheduleSync(onDone) {
  if (!isConnected() || !hasValidToken()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().then(() => onDone?.(null)).catch((e) => onDone?.(e)), 2500);
}
