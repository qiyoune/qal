// Photos de plats libres de droits (Openverse, puis Wikimedia Commons en secours).
// Pas de clé nécessaire. Chaque photo garde son crédit (auteur + licence).

const OV = 'https://api.openverse.org/v1/images/';
const WM = 'https://commons.wikimedia.org/w/api.php';

const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

async function openverse(q) {
  const u = `${OV}?q=${encodeURIComponent(q)}&page_size=8&mature=false&aspect_ratio=wide,square`;
  const res = await withTimeout(fetch(u));
  if (!res.ok) throw new Error('openverse ' + res.status);
  const j = await res.json();
  return (j.results || []).filter((r) => r.id).map((r) => ({
    url: r.thumbnail || `${OV}${r.id}/thumb/`,
    credit: [r.creator, r.license ? `CC ${String(r.license).toUpperCase()}${r.license_version ? ' ' + r.license_version : ''}` : ''].filter(Boolean).join(' · ') + ' (Openverse)',
  }));
}

async function wikimedia(q) {
  const u = `${WM}?action=query&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&format=json&origin=*`;
  const res = await withTimeout(fetch(u));
  if (!res.ok) throw new Error('wikimedia ' + res.status);
  const j = await res.json();
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl) return null;
    const m = ii.extmetadata || {};
    const artist = String(m.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 40);
    return { url: ii.thumburl, credit: [artist, m.LicenseShortName?.value].filter(Boolean).join(' · ') + ' (Wikimedia)' };
  }).filter(Boolean);
}

export async function findDishPhotos(query) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return [];
  let out = [];
  try { out = await openverse(q); } catch {}
  if (out.length < 3) { try { out = [...out, ...(await wikimedia(q))]; } catch {} }
  const seen = new Set();
  return out.filter((p) => !seen.has(p.url) && seen.add(p.url)).slice(0, 8);
}

// Télécharge la photo et la garde dans la recette (marche hors ligne). Si le site
// ne le permet pas, on garde simplement le lien.
export function urlToDataUrl(url, w = 640, h = 480, q = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => reject(new Error('timeout')), 12000);
    img.onload = () => {
      clearTimeout(t);
      try {
        const k = Math.max(w / img.width, h / img.height);
        const sw = w / k, sh = h / k;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', q));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { clearTimeout(t); reject(new Error('image')); };
    img.src = url;
  });
}
