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
  try { k ? localStorage.setItem(GKEY, k.trim()) : localStorage.removeItem(GKEY); localStorage.removeItem(GMODEL); } catch {}
}

const SYSTEM = `Tu es l'assistant nutrition de l'appli qal ✦. Tu parles français, tu tutoies, tu es direct, chaleureux et concret.
Tu t'appuies sur le profil et la journée de l'utilisateur fournis ci-dessous (ses réponses écrites sont précieuses : utilise-les).
Réponses courtes (3 à 6 phrases), avec des quantités précises en grammes quand tu proposes à manger. Pas de markdown.
Tu n'inventes pas ce qu'il a mangé : tu utilises le contexte.
Tu n'es pas médecin : en cas de question médicale ou de trouble alimentaire, oriente vers un professionnel.`;

const GAPI = 'https://generativelanguage.googleapis.com/v1beta';

// Trouve un modèle "flash" disponible pour cette clé (les noms changent avec le temps)
async function pickModel(key) {
  try { const m = localStorage.getItem(GMODEL); if (m) return m; } catch {}
  let model = 'gemini-flash-latest';
  try {
    const r = await fetch(`${GAPI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (r.status === 400 || r.status === 403) { const e = new Error('cle'); e.badKey = true; throw e; }
    const d = await r.json();
    const names = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''));
    const flash = names.filter((n) => /flash/.test(n) && !/(image|tts|audio|live|thinking|exp|preview|lite)/.test(n));
    model = names.includes('gemini-flash-latest') ? 'gemini-flash-latest' : (flash.sort().reverse()[0] || names[0] || model);
  } catch (e) { if (e.badKey) throw e; }
  try { localStorage.setItem(GMODEL, model); } catch {}
  return model;
}

async function askGemini(key, history, context) {
  const model = await pickModel(key);
  const r = await fetch(`${GAPI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\n--- Contexte utilisateur ---\n${context}` }] },
      contents: history.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    }),
  });
  if (r.status === 404) { try { localStorage.removeItem(GMODEL); } catch {} }
  if (r.status === 400 || r.status === 403) { const e = new Error('cle'); e.badKey = true; throw e; }
  if (r.status === 429) { const e = new Error('quota'); e.quota = true; throw e; }
  if (!r.ok) throw new Error('gemini ' + r.status);
  const d = await r.json();
  const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return text.replace(/\*\*(.+?)\*\*/g, '$1') || '…';
}

export async function testGeminiKey(key) {
  const reply = await askGemini(key.trim(), [{ role: 'user', text: 'Réponds juste : ok ✦' }], '');
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
