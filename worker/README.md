# Brancher l'IA sur qal ✦

La clé API ne doit **jamais** être dans l'appli (tout le monde pourrait la lire).
On passe par un petit serveur gratuit, un *Cloudflare Worker*, qui la garde secrète.

1. Crée un compte sur [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → *Hello World*.
2. Remplace le code par celui de `ai-proxy.js` → **Deploy**.
3. **Settings → Variables and Secrets** :
   - `ANTHROPIC_API_KEY` (type *Secret*) : ta clé, à créer sur [console.anthropic.com](https://console.anthropic.com)
   - `MODEL` : le nom d'un modèle Claude (liste sur docs.claude.com)
   - `ALLOWED_ORIGIN` : `https://qiyoune.github.io`
4. Copie l'adresse du Worker (`https://xxx.workers.dev`) dans `js/config.js` → `AI_ENDPOINT`.

L'API est payante à l'usage (quelques centimes pour des centaines de messages courts) : mets une limite de dépense dans la console Anthropic.
