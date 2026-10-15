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

export const isOnline = () => !!AI_ENDPOINT;

export async function ask(history) {
  const context = buildContext();
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
  return `L'IA n'est pas encore branchée ✦ En attendant, voilà ta journée : ${left >= 0 ? `il te reste ${fmt(left)} kcal` : `tu es ${fmt(-left)} kcal au-dessus`}, et ${pLeft > 0 ? `${fmt(pLeft)} g de protéines à aller chercher` : 'ton objectif de protéines est atteint'}.`;
}
