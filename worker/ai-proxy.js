// Proxy IA pour qal (Cloudflare Worker).
// Il garde ta clé API secrète : l'appli appelle ce Worker, le Worker appelle l'API d'Anthropic.
// Variables à définir dans Cloudflare (Settings → Variables) :
//   ANTHROPIC_API_KEY  (secret)  ta clé API
//   MODEL              ex : un modèle Claude listé sur docs.claude.com/en/docs/about-claude/models
//   ALLOWED_ORIGIN     https://qiyoune.github.io

const SYSTEM = `Tu es l'assistant nutrition de l'appli qal ✦. Tu parles français, tu tutoies, tu es direct, chaleureux et concret.
Tu t'appuies sur le profil et la journée de l'utilisateur fournis ci-dessous (ses réponses écrites sont précieuses : utilise-les).
Réponses courtes (3 à 6 phrases max), avec des quantités précises quand tu proposes à manger.
Tu n'es pas médecin : en cas de question médicale ou de trouble alimentaire, oriente vers un professionnel.`;

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Not found', { status: 404, headers: cors });

    const { context = '', messages = [] } = await req.json().catch(() => ({}));
    const clean = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') {
      return Response.json({ error: 'bad request' }, { status: 400, headers: cors });
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.MODEL,
        max_tokens: 600,
        system: `${SYSTEM}\n\n--- Contexte utilisateur ---\n${String(context).slice(0, 4000)}`,
        messages: clean,
      }),
    });
    if (!r.ok) return Response.json({ error: 'ia ' + r.status }, { status: 502, headers: cors });
    const d = await r.json();
    const reply = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    return Response.json({ reply }, { headers: cors });
  },
};
