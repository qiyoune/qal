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
        setMeta({ driveConnected: true });
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

// Télécharge la version Drive, fusionne avec le local, renvoie le résultat.
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    const file = await findFile();
    const remote = file ? await download(file.id) : null;
    const merged = merge(getState(), remote);
    const { meta, ...toUpload } = merged;
    await upload(file?.id, toUpload);
    replaceState(merged, { fromSync: true });
    setMeta({ lastSync: Date.now() });
    return true;
  })().finally(() => { syncing = null; });
  return syncing;
}

let timer = null;
export function scheduleSync(onDone) {
  if (!isConnected() || !hasValidToken()) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync().then(() => onDone?.(null)).catch((e) => onDone?.(e)), 2500);
}
