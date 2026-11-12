// qal ✦ — relais de connexion Google (Cloudflare Worker, gratuit)
// Sans lui, Google ne donne à l'appli qu'un accès d'1 h : la synchro se met en pause toutes les heures.
// Avec lui, l'appli reçoit un « jeton de renouvellement » et reste connectée tant que tu ne te déconnectes pas.
// Le relais ne fait qu'ajouter le secret de l'appli aux demandes envoyées à Google : il ne garde rien
// (ni jeton, ni donnée) et ne voit jamais le contenu de ton Drive.
//
// Variables à créer dans Cloudflare (Settings → Variables and Secrets) :
//   GOOGLE_CLIENT_ID      : le même que dans js/config.js
//   GOOGLE_CLIENT_SECRET  : (type Secret) le « code secret du client » de la console Google Cloud

const ALLOWED = ['https://qal.qiyoune.com', 'https://qiyoune.github.io', 'http://localhost:8765'];
const GOOGLE = 'https://oauth2.googleapis.com/token';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
    if (!ALLOWED.includes(origin)) return json({ error: 'origin' }, 403);
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'not_configured' }, 500);

    let body = {};
    try { body = await request.json(); } catch {}
    const path = new URL(request.url).pathname;
    const form = { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET };
    if (path === '/token' && typeof body.code === 'string') {
      // première connexion : on échange le code donné par la fenêtre Google ("postmessage" = mode fenêtre)
      Object.assign(form, { grant_type: 'authorization_code', code: body.code, redirect_uri: 'postmessage' });
    } else if (path === '/refresh' && typeof body.refresh_token === 'string') {
      Object.assign(form, { grant_type: 'refresh_token', refresh_token: body.refresh_token });
    } else return json({ error: 'not_found' }, 404);

    let r, d;
    try {
      r = await fetch(GOOGLE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
      d = await r.json();
    } catch { return json({ error: 'google_unreachable' }, 502); }
    if (!r.ok) {
      // invalid_grant : l'accès a été retiré ou a expiré → 401, l'appli redemandera une connexion.
      // Toute autre erreur (secret faux, panne) → 502 : l'appli garde sa connexion et réessaiera.
      return json({ error: d.error || 'google_error' }, d.error === 'invalid_grant' ? 401 : 502);
    }
    return json({ access_token: d.access_token, expires_in: d.expires_in, ...(d.refresh_token ? { refresh_token: d.refresh_token } : {}) });
  },
};
