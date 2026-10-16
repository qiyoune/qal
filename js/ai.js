// Chat IA : construit le contexte de l'utilisateur et l'envoie au proxy IA.
// La clé API ne doit JAMAIS être dans l'appli : elle reste dans le proxy (serveur).
import { AI_ENDPOINT } from './config.js';
import { getState, entriesFor, MEALS } from './store.js';
import { totals, scale, fmt } from './nutrition.js';
import { dateStr } from './ui.js';

const KEY = 'qal:chat';

export function loadChat() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveChat(msgs) {
  try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-60))); } catch {}
}
export function clearChat() { try { localStorage.removeItem(KEY); } catch {} }

// Tout ce que l'IA doit savoir sur toi, en texte clair
export function buildContext(date = dateStr()) {
  const st = getState();
  const p = st.profile || {};
  const g = st.goals || {};
  const entries = entriesFor(date);
  const { t } = totals(entries);
  const lines = [];
  lines.push(`Profil : ${p.name || 'utilisateur'}, ${p.sex === 'f' ? 'femme' : 'homme'}, ${p.age} ans, ${p.height} cm, ${p.weight} kg.`);
  lines.push(`Objectif : ${{ lose: 'perdre du gras', maintain: 'maintenir son poids', gain: 'prendre du muscle' }[p.goal] || '?'}. Appétit : ${p.appetite || '?'}.`);
  if (p.dayText) lines.push(`Sa journée type (écrit par lui) : « ${p.dayText} »`);
  if (p.trainText) lines.push(`Son entraînement (écrit par lui) : « ${p.trainText} »`);
  lines.push(`Objectifs du jour : ${g.kcal} kcal, P ${g.prot} g, G ${g.carb} g, L ${g.fat} g.`);
  lines.push(`Mangé aujourd'hui (${date}) : ${fmt(t.kcal)} kcal, P ${fmt(t.prot)} g, G ${fmt(t.carb)} g, L ${fmt(t.fat)} g, fibres ${fmt(t.fiber)} g.`);
  for (const m of MEALS) {
    const items = entries.filter((e) => e.meal === m.id);
    if (items.length) lines.push(`- ${m.label} : ${items.map((e) => `${e.name} ${fmt(e.grams)} g (${fmt(scale(e.per100, e.grams).kcal)} kcal)`).join(', ')}`);
  }
  return lines.join('\n');
}

/* ---------- Clé Gemini de l'utilisateur (gratuite sur aistudio.google.com) ---------- */
// La clé reste sur CET appareil (localStorage) : elle n'est ni synchronisée ni envoyée ailleurs que chez Google.
const GKEY = 'qal:gemini-key';
const GMODEL = 'qal:gemini-model';
export const getGeminiKey = () => { try { return localStorage.getItem(GKEY) || ''; } catch { return ''; } };
export function setGeminiKey(k) {
  k = (k || '').trim().replace(/^['"]|['"]$/g, '');
  try { k ? localStorage.setItem(GKEY, k) : localStorage.removeItem(GKEY); } catch {}
}

const SYSTEM = `Tu es l'assistant nutrition de l'appli qal ✦. Tu parles français, tu tutoies, tu es direct, chaleureux et concret.
Tu t'appuies sur le profil et la journée de l'utilisateur fournis ci-dessous (ses réponses écrites sont précieuses : utilise-les).
Réponses courtes (3 à 6 phrases), avec des quantités précises en grammes quand tu proposes à manger. Pas de markdown.
Tu n'inventes pas ce qu'il a mangé : tu utilises le contexte.
Tu n'es pas médecin : en cas de question médicale ou de trouble alimentaire, oriente vers un professionnel.`;

const GAPI = 'https://generativelanguage.googleapis.com/v1beta';

// Les noms de modèles changent : on essaie dans l'ordre, et on retient celui qui marche
const CANDIDATES = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-lite-latest'];

async function listModels(key) {
  try {
    const r = await gfetch(key, `${GAPI}/models?pageSize=200`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
      .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embedding)/.test(n));
  } catch { return []; }
}

// Appel Google : clé dans l'en-tête, et si le navigateur bloque, clé dans l'adresse (?key=)
async function gfetch(key, url, opts = {}) {
  try {
    return await fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'x-goog-api-key': key } });
  } catch (e) {
    const sep = url.includes('?') ? '&' : '?';
    return fetch(`${url}${sep}key=${encodeURIComponent(key)}`, opts);
  }
}

async function googleError(r) {
  let msg = '';
  try { msg = (await r.json())?.error?.message || ''; } catch {}
  const e = new Error(msg || 'gemini ' + r.status);
  e.status = r.status;
  e.detail = msg;
  if (r.status === 429 || /quota|rate/i.test(msg)) e.quota = true;
  else if (r.status === 401 || r.status === 403 || /api key|API_KEY|permission|unauthenticated/i.test(msg)) e.badKey = true;
  return e;
}

async function askGemini(key, history, context) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\n--- Contexte utilisateur ---\n${context}` }] },
    contents: history.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  });
  let saved = null;
  try { saved = localStorage.getItem(GMODEL); } catch {}
  const tried = new Set();
  const queue = [...(saved ? [saved] : []), ...CANDIDATES];
  let lastErr = null, listed = false;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    const r = await gfetch(key, `${GAPI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (r.ok) {
      try { localStorage.setItem(GMODEL, model); } catch {}
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      return text.replace(/\*\*(.+?)\*\*/g, '$1') || '…';
    }
    lastErr = await googleError(r);
    if (lastErr.badKey || lastErr.quota) throw lastErr;
    // modèle introuvable : on demande la liste à Google une fois
    if (!listed && (r.status === 404 || r.status === 400)) { listed = true; queue.push(...(await listModels(key))); }
  }
  throw lastErr || new Error('gemini');
}

export async function testGeminiKey(key) {
  const reply = await askGemini(key.trim().replace(/^['"]|['"]$/g, ''), [{ role: 'user', text: 'Réponds juste : ok' }], '');
  return !!reply;
}

export const isOnline = () => !!AI_ENDPOINT || !!getGeminiKey();

export async function ask(history) {
  const context = buildContext();
  const key = getGeminiKey();
  if (key) return askGemini(key, history, context);
  if (!AI_ENDPOINT) return offlineReply();
  const r = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages: history.map(({ role, text }) => ({ role, content: text })) }),
  });
  if (!r.ok) throw new Error('ia ' + r.status);
  const d = await r.json();
  return d.reply || '…';
}

// Sans IA branchée : un résumé utile de la journée
function offlineReply() {
  const st = getState();
  const g = st.goals || {};
  const { t } = totals(entriesFor(dateStr()));
  const left = Math.round(g.kcal - t.kcal);
  const pLeft = Math.round(g.prot - t.prot);
  return `L'IA n'est pas encore branchée : ajoute ta clé Gemini gratuite dans Profil → IA ✦ En attendant, voilà ta journée : ${left >= 0 ? `il te reste ${fmt(left)} kcal` : `tu es ${fmt(-left)} kcal au-dessus`}, et ${pLeft > 0 ? `${fmt(pLeft)} g de protéines à aller chercher` : 'ton objectif de protéines est atteint'}.`;
}
