// Service worker : l'appli s'ouvre même sans réseau.
// Change VERSION à chaque mise à jour pour forcer le rafraîchissement.
const VERSION = 'qal-v15';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/nutrition.js', 'js/foods.js', 'js/scanner.js', 'js/sheets.js', 'js/drive.js', 'js/config.js', 'js/fx.js', 'js/ai.js', 'js/picker.js',
  'js/views/today.js', 'js/views/add.js', 'js/views/profile.js', 'js/views/onboarding.js', 'js/views/micros.js', 'js/views/recipes.js', 'js/views/chat.js',
  'data/ciqual.json', 'fonts/alstoria.woff', 'vendor/barcode-detector.js', 'vendor/zxing_reader.wasm',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fichiers de l'appli : réseau d'abord (pour avoir les mises à jour), cache si hors ligne.
// Les API (Open Food Facts, Google) ne sont jamais mises en cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
