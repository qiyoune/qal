// Sources de données : Ciqual (local) + Open Food Facts (en ligne)

/* ---------- Ciqual (table officielle ANSES, aliments bruts) ---------- */
let ciqual = null;
let ciqualPromise = null;

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function loadCiqual() {
  if (ciqualPromise) return ciqualPromise;
  ciqualPromise = fetch('data/ciqual.json')
    .then((r) => r.json())
    .then((d) => {
      ciqual = d.foods.map((row) => {
        const [name, group, ...vals] = row;
        const per100 = {};
        d.keys.forEach((k, i) => { per100[k] = vals[i]; });
        return { name, group, per100, source: 'ciqual', _n: norm(name) };
      });
      return ciqual;
    })
    .catch((e) => { ciqualPromise = null; throw e; });
  return ciqualPromise;
}

export async function searchCiqual(q, limit = 25) {
  const list = await loadCiqual();
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const res = [];
  for (const f of list) {
    let ok = true;
    for (const w of words) if (!f._n.includes(w)) { ok = false; break; }
    if (!ok) continue;
    let score = f._n.length;
    if (f._n.startsWith(words[0])) score -= 60;
    if (new RegExp('\\b' + words[0]).test(f._n)) score -= 25;
    if (/\bcrue?\b/.test(f._n)) score -= 4;
    res.push([score, f]);
  }
  res.sort((a, b) => a[0] - b[0]);
  return res.slice(0, limit).map((x) => x[1]);
}

/* ---------- Open Food Facts (produits du commerce, codes-barres) ---------- */
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,quantity,serving_quantity,serving_size,nutriments,image_front_small_url,image_front_thumb_url';

function n(v) { const x = parseFloat(v); return isFinite(x) ? x : null; }

export function fromOFF(p) {
  if (!p) return null;
  const nu = p.nutriments || {};
  let kcal = n(nu['energy-kcal_100g']);
  if (kcal == null && n(nu.energy_100g) != null) kcal = n(nu.energy_100g) / 4.184; // kJ -> kcal
  const g = (k, mult = 1) => (n(nu[k + '_100g']) == null ? null : n(nu[k + '_100g']) * mult);
  const per100 = {
    kcal, prot: g('proteins'), carb: g('carbohydrates'), fat: g('fat'),
    sugar: g('sugars'), fiber: g('fiber'), satfat: g('saturated-fat'), salt: g('salt'),
    // OFF stocke les minéraux/vitamines en grammes
    calcium: g('calcium', 1000), iron: g('iron', 1000), magnesium: g('magnesium', 1000),
    potassium: g('potassium', 1000), zinc: g('zinc', 1000),
    vitD: g('vitamin-d', 1e6), vitC: g('vitamin-c', 1000), folate: g('vitamin-b9', 1e6), b12: g('vitamin-b12', 1e6),
  };
  const name = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
  return {
    name: name || 'Produit sans nom',
    brand: (p.brands || '').split(',')[0].trim(),
    code: p.code || '',
    img: p.image_front_small_url || p.image_front_thumb_url || '',
    quantity: p.quantity || '',
    serving: n(p.serving_quantity) ? { grams: n(p.serving_quantity), label: p.serving_size || 'portion' } : null,
    per100,
    source: 'off',
    incomplete: kcal == null,
  };
}

export async function getProduct(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}&lc=fr`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('off ' + r.status);
  const d = await r.json();
  if (d.status !== 1 && d.status !== 'success') return null;
  return fromOFF(d.product);
}

// Recherche limitée à ~10 requêtes/min par Open Food Facts : on espace les appels.
let lastSearch = 0;
export async function searchOFF(q, signal) {
  const wait = Math.max(0, lastSearch + 6000 - Date.now());
  if (wait) await new Promise((res, rej) => {
    const t = setTimeout(res, wait);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); });
  });
  lastSearch = Date.now();
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&tagtype_0=countries&tag_contains_0=contains&tag_0=france&fields=${FIELDS}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('off ' + r.status);
  const d = await r.json();
  return (d.products || []).map(fromOFF).filter((f) => f && !f.incomplete);
}

export function offAddUrl(code) {
  return `https://fr.openfoodfacts.org/cgi/product.pl?type=search_or_add&action=process&code=${encodeURIComponent(code || '')}`;
}
