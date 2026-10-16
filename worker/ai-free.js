// Proxy IA GRATUIT pour qal (Cloudflare Worker + Workers AI).
// Aucune clé API, aucune carte bancaire : le modèle tourne chez Cloudflare,
// dans la limite gratuite de 10 000 "neurons" par jour (remise à zéro à minuit UTC).
//
// À régler dans Cloudflare (Settings → Bindings / Variables) :
//   Binding "Workers AI"  nom : AI
//   ALLOWED_ORIGIN        https://qiyoune.github.io
//   MODEL (optionnel)     un modèle du catalogue Workers AI

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const SYSTEM = `Tu es l'assistant nutrition de l'appli qal ✦. Tu parles uniquement français, tu tutoies, tu es direct, chaleureux et concret.
Tu t'appuies sur le profil et la journée de l'utilisateur fournis ci-dessous (ses réponses écrites sont précieuses : utilise-les).
Réponses courtes (3 à 6 phrases max), avec des quantités précises en grammes quand tu proposes à manger.
Tu n'inventes pas de chiffres sur ce qu'il a mangé : tu utilises ceux du contexte.
Tu n'es pas médecin : en cas de question médicale ou de trouble alimentaire, oriente vers un professionnel.`;

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('qal ia ✦ ok', { headers: cors });

    const { context = '', messages = [] } = await req.json().catch(() => ({}));
    const clean = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') {
      return Response.json({ error: 'bad request' }, { status: 400, headers: cors });
    }

    const input = {
      messages: [{ role: 'system', content: `${SYSTEM}\n\n--- Contexte utilisateur ---\n${String(context).slice(0, 3000)}` }, ...clean],
      max_tokens: 450,
      temperature: 0.6,
    };

    try {
      let out;
      try { out = await env.AI.run(env.MODEL || DEFAULT_MODEL, input); }
      catch { out = await env.AI.run(FALLBACK_MODEL, input); } // plan B : modèle plus léger
      const reply = (out?.response || '').trim();
      return Response.json({ reply: reply || '…' }, { headers: cors });
    } catch (e) {
      // le plus souvent : limite gratuite du jour atteinte
      return Response.json({ reply: "J'ai atteint ma limite gratuite pour aujourd'hui ✦ Réessaie demain, le compteur se remet à zéro dans la nuit." }, { headers: cors });
    }
  },
};
