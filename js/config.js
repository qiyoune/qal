// Colle ici ton "ID client OAuth" Google (type : Application Web).
// Voir README.md → section "Synchro Google Drive". Ce n'est pas un secret, il peut être public.
export const GOOGLE_CLIENT_ID = '1079120100702-hqtum8ppo8qrqgk2s1qdtp6m1rvncjfp.apps.googleusercontent.com';

// Relais de connexion Google (Cloudflare Worker, voir worker/google-auth.js et worker/README.md).
// Vide = Google ne donne qu'un accès d'1 h : la synchro se met en pause et il faut toucher la pastille.
// Rempli = l'appli reste connectée en permanence.
export const GOOGLE_AUTH_PROXY = '';

// Adresse de ton "proxy IA" (ex : un Cloudflare Worker, voir worker/README.md).
// Vide = le chat fonctionne en mode hors ligne (il répond avec tes chiffres du jour).
export const AI_ENDPOINT = '';

// Relais de recherche Open Food Facts (Cloudflare Worker, voir worker/off-search.js). Vide = recherche directe, limitée.
export const OFF_PROXY = 'https://qal-off.qiyoune.com';
