// qal ✦ — relais de recherche Open Food Facts (Cloudflare Worker, gratuit)
// Le moteur de recherche d'Open Food Facts (search.openfoodfacts.org) n'autorise pas les appels
// depuis un site web (pas de CORS). Ce petit relais fait la requête, ajoute les bons en-têtes,
// et garde chaque résultat 24 h en cache pour ne pas surcharger Open Food Facts.

const ALLOWED = ['https://qal.qiyoune.com', 'https://qiyoune.github.io', 'http://localhost:8765'];
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,quantity,serving_quantity,serving_size,nutriments,image_front_small_url,image_front_thumb_url';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (url.pathname !== '/search' || !q) return new Response('not found', { status: 404, headers: cors });

    // cache partagé : la même recherche (ex : "actimel") ne part qu'une fois par jour chez Open Food Facts
    const cacheKey = new Request(`https://cache.qal/search?q=${encodeURIComponent(q.toLowerCase())}`);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const target = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=fr&page_size=24&fields=${FIELDS}`;
      const up = await fetch(target, { headers: { 'User-Agent': 'qal/1.0 (contact@qiyoune.com)' } });
      if (!up.ok) return new Response(JSON.stringify({ error: up.status }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      const data = await up.json();
      res = new Response(JSON.stringify({ hits: data.hits || [], count: data.count || 0 }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
