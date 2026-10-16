// Chat IA : construit le contexte de l'utilisateur et l'envoie au proxy IA.
// La clé API ne doit JAMAIS être dans l'appli : elle reste dans le proxy (serveur).
import { AI_ENDPOINT } from './config.js';
import { getState, entriesFor, MEALS, weightsList } from './store.js';
import { totals, scale, fmt } from './nutrition.js';
import { dateStr, addDays } from './ui.js';

const KEY = 'qal:chat';

// La conversation est gardée tant que l'appli est ouverte (même en arrière-plan),
// et repart à zéro quand on ferme complètement l'appli (sessionStorage + mémoire).
let memChat = null;
try { localStorage.removeItem(KEY); } catch {} // ancienne version : historique permanent
export function loadChat() {
  if (memChat) return memChat;
  try { memChat = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { memChat = []; }
  return memChat;
}
export function saveChat(msgs) {
  memChat = msgs.slice(-60);
  try { sessionStorage.setItem(KEY, JSON.stringify(memChat)); } catch {}
}
export function clearChat() { memChat = []; try { sessionStorage.removeItem(KEY); } catch {} }

// Tout ce que l'IA doit savoir sur toi, en texte clair
export function buildContext(date = dateStr()) {
  const st = getState();
  const p = st.profile || {};
  const g = st.goals || {};
  const entries = entriesFor(date);
  const { t } = totals(entries);
  const lines = [];
  const now = new Date();
  lines.push(`Nous sommes le ${date}, il est ${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}.`);
  lines.push(`Profil : ${p.name || 'utilisateur'}, ${p.sex === 'f' ? 'femme' : 'homme'}, ${p.age} ans, ${p.height} cm, ${p.weight} kg.`);
  lines.push(`Objectif : ${{ lose: 'perdre du gras', maintain: 'maintenir son poids', gain: 'prendre du muscle' }[p.goal] || '?'}. Appétit : ${p.appetite || '?'}.`);
  const L = {
    daily: { assis: 'plutôt assis', debout: 'souvent debout', physique: 'boulot physique' },
    steps: { lt5: 'moins de 5 000', '5to8': '5 000 à 8 000', '8to12': '8 000 à 12 000', gt12: 'plus de 12 000', unknown: 'inconnu' },
    trainFreq: { 0: 'jamais', 1: '1-2 fois/semaine', 2: '3-4 fois/semaine', 3: '5+ fois/semaine' },
    diet: { omni: 'mange de tout', flexi: 'flexitarien', pesco: 'pescétarien', vege: 'végétarien', vegan: 'vegan' },
    restrictions: { none: 'aucune', halal: 'halal', noPork: 'sans porc', noLactose: 'sans lactose', noGluten: 'sans gluten', noNuts: 'allergie fruits à coque', other: 'autre (voir texte)' },
    cooking: { never: 'cuisine presque jamais', simple: 'cuisine des trucs simples (15 min max)', often: 'cuisine souvent avec plaisir' },
    pace: { slow: 'tranquille', fast: 'soutenu' },
  };
  if (p.targetWeight) lines.push(`Poids visé : ${p.targetWeight} kg${p.pace ? `, rythme ${L.pace[p.pace]}` : ''}.`);
  if (p.whyText) lines.push(`Sa motivation (écrit par lui) : « ${p.whyText} »`);
  lines.push(`Activité : journée ${L.daily[p.daily] || '?'}, pas par jour ${L.steps[p.steps] || '?'}, sport ${L.trainFreq[p.trainFreq] || '?'}${(p.training || []).length ? ' (' + p.training.join(', ') + ')' : ''}.`);
  if (p.dayText) lines.push(`Sa journée type (écrit par lui) : « ${p.dayText} »`);
  if (p.trainText) lines.push(`Son entraînement (écrit par lui) : « ${p.trainText} »`);
  lines.push(`Alimentation : ${L.diet[p.diet] || '?'} ; restrictions : ${(p.restrictions || []).map((r) => L.restrictions[r] || r).join(', ') || '?'} ; ${p.meals ? p.meals + ' prises alimentaires par jour' : ''} ; ${L.cooking[p.cooking] || ''}.`);
  if (p.foodText) lines.push(`Goûts (écrit par lui) : « ${p.foodText} »`);
  if (p.healthText) lines.push(`Santé (écrit par lui) : « ${p.healthText} » — en tenir compte, sans poser de diagnostic.`);
  lines.push(`Objectifs du jour : ${g.kcal} kcal, P ${g.prot} g, G ${g.carb} g, L ${g.fat} g.`);
  lines.push(`Mangé aujourd'hui (${date}) : ${fmt(t.kcal)} kcal, P ${fmt(t.prot)} g, G ${fmt(t.carb)} g, L ${fmt(t.fat)} g, fibres ${fmt(t.fiber)} g.`);
  for (const m of MEALS) {
    const items = entries.filter((e) => e.meal === m.id);
    if (items.length) lines.push(`- ${m.label} (meal=${m.id}) : ${items.map((e) => `[id=${e.id}] ${e.name} ${fmt(e.grams)} g (${fmt(scale(e.per100, e.grams).kcal)} kcal)`).join(', ')}`);
  }
  // 7 derniers jours (jours notés uniquement) pour les bilans
  const week = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    const es = entriesFor(d);
    if (!es.length) continue;
    const tt = totals(es).t;
    week.push(`${d} : ${fmt(tt.kcal)} kcal, P ${fmt(tt.prot)} g, G ${fmt(tt.carb)} g, L ${fmt(tt.fat)} g, fibres ${fmt(tt.fiber)} g (${es.length} aliments)`);
  }
  lines.push(week.length ? `7 jours précédents (jours notés) :\n${week.join('\n')}` : '7 jours précédents : aucun repas noté.');
  const ws = weightsList().slice(-10);
  if (ws.length) lines.push(`Pesées récentes : ${ws.map((w) => `${w.date} ${w.kg} kg`).join(', ')}.`);
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
Tu n'inventes pas ce qu'il a mangé : tu utilises le contexte. Respecte TOUJOURS son régime, ses restrictions et allergies dans tes idées de repas, et adapte la difficulté des recettes à sa façon de cuisiner.
Tu n'es pas médecin : en cas de question médicale ou de trouble alimentaire, oriente vers un professionnel.

Tu peux agir sur l'appli avec tes outils : ajouter des aliments au journal (add_foods), modifier ou supprimer une entrée existante (update_entry, delete_entry, avec son id du contexte), créer une recette (create_recipe).
- Utilise-les quand l'utilisateur dit ce qu'il a mangé ou demande de modifier son journal ou de créer une recette. Il validera lui-même avant que ce soit appliqué.
- Pour chaque aliment, donne un nom générique en français façon table Ciqual, aliment principal en premier puis précisions (ex : "riz basmati cuit", "poulet poitrine cuit", "pomme crue", "huile olive", "pates alimentaires cuites"), et une quantité en grammes réaliste (1 oeuf ≈ 55 g, 1 c. à soupe d'huile ≈ 10 g). N'invente jamais les calories : l'appli les calcule.
- Choisis le repas (breakfast, lunch, snack, dinner) selon ce qu'il dit, sinon selon l'heure.
- Accompagne toujours l'action d'une phrase courte.

Photos :
- Photo d'assiette ou de plat : identifie chaque aliment visible, estime les grammes honnêtement (huile, sauce, fromage : ne les oublie pas, et plutôt un peu au-dessus qu'en dessous), puis propose add_foods. Dis en une phrase ce que tu as vu et que l'utilisateur peut corriger les grammes.
- Photo d'étiquette ou de tableau nutritionnel : lis les valeurs POUR 100 g et utilise create_food (nom du produit, marque si visible, code-barres si visible).

Bilan de la semaine : appuie-toi sur les 7 jours précédents et les pesées du contexte. Moyennes, régularité, protéines, une ou deux pistes concrètes. Ton encourageant, jamais culpabilisant.`;

const GAPI = 'https://generativelanguage.googleapis.com/v1beta';

const ITEMS = { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING', description: 'nom générique de l\'aliment' }, grams: { type: 'NUMBER' } }, required: ['name', 'grams'] } };
const MEAL = { type: 'STRING', enum: ['breakfast', 'lunch', 'snack', 'dinner'] };
const TOOLS = [{ functionDeclarations: [
  { name: 'add_foods', description: 'Ajoute des aliments au journal', parameters: { type: 'OBJECT', properties: { meal: MEAL, date: { type: 'STRING', description: 'YYYY-MM-DD, aujourd\'hui par défaut' }, items: ITEMS }, required: ['meal', 'items'] } },
  { name: 'update_entry', description: 'Modifie la quantité ou le repas d\'une entrée du journal', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, grams: { type: 'NUMBER' }, meal: MEAL }, required: ['id'] } },
  { name: 'delete_entry', description: 'Supprime une entrée du journal', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
  { name: 'create_food', description: 'Crée un aliment perso à partir d\'une étiquette nutritionnelle (valeurs pour 100 g)', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, brand: { type: 'STRING' }, kcal: { type: 'NUMBER' }, prot: { type: 'NUMBER' }, carb: { type: 'NUMBER' }, fat: { type: 'NUMBER' }, sugar: { type: 'NUMBER' }, fiber: { type: 'NUMBER' }, salt: { type: 'NUMBER' }, serving_grams: { type: 'NUMBER' }, barcode: { type: 'STRING' } }, required: ['name', 'kcal', 'prot', 'carb', 'fat'] } },
  { name: 'create_recipe', description: 'Crée une recette enregistrée', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, portions: { type: 'NUMBER' }, ingredients: ITEMS, preparation: { type: 'STRING', description: 'étapes de préparation' } }, required: ['name', 'portions', 'ingredients'] } },
] }];

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
    contents: history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text || 'Photo' }, ...(m.image ? [{ inlineData: { mimeType: 'image/jpeg', data: m.image.split(',')[1] } }] : [])],
    })),
    tools: TOOLS,
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
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
      const parts = d.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || '').join('').trim().replace(/\*\*(.+?)\*\*/g, '$1');
      const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
      return { text: text || (calls.length ? '' : '…'), calls };
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
  if (!AI_ENDPOINT) return { text: offlineReply(), calls: [] };
  const r = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages: history.map(({ role, text }) => ({ role, content: text })) }),
  });
  if (!r.ok) throw new Error('ia ' + r.status);
  const d = await r.json();
  return { text: d.reply || '…', calls: [] };
}

// Sans IA branchée : un résumé utile de la journée
function offlineReply() {
  const st = getState();
  const g = st.goals || {};
  const { t } = totals(entriesFor(dateStr()));
  const left = Math.round(g.kcal - t.kcal);
  const pLeft = Math.round(g.prot - t.prot);
  return `L'IA n'est pas encore branchée : ajoute ta clé Gemini gratuite dans Options → IA ✦ En attendant, voilà ta journée : ${left >= 0 ? `il te reste ${fmt(left)} kcal` : `tu es ${fmt(-left)} kcal au-dessus`}, et ${pLeft > 0 ? `${fmt(pLeft)} g de protéines à aller chercher` : 'ton objectif de protéines est atteint'}.`;
}
