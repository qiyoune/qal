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

# Garder la synchro Google connectée en permanence

Sans relais, Google ne donne à l'appli qu'un accès d'1 h : la synchro se met en pause toutes les heures.
Le Worker `google-auth.js` règle ça. Il ne garde rien et ne voit jamais tes données : il ajoute seulement
le secret de l'appli aux demandes de connexion envoyées à Google.

1. [console.cloud.google.com](https://console.cloud.google.com) → **API et services → Identifiants** → ouvre ton ID client OAuth (celui de `js/config.js`) → copie le **code secret du client**.
2. Au même endroit, **Écran de consentement OAuth** : l'appli doit être **En production** (en mode *Test*, Google coupe la connexion tous les 7 jours).
3. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → *Hello World* → remplace le code par celui de `google-auth.js` → **Deploy**.
4. **Settings → Variables and Secrets** :
   - `GOOGLE_CLIENT_ID` : l'ID client (le même que dans `js/config.js`)
   - `GOOGLE_CLIENT_SECRET` (type *Secret*) : le code secret copié à l'étape 1
5. Copie l'adresse du Worker (`https://xxx.workers.dev`, ou un domaine à toi) dans `js/config.js` → `GOOGLE_AUTH_PROXY`.
6. Sur chaque appareil, touche une fois la pastille de synchro : Google redemande ton accord, puis la connexion ne s'arrête plus.

Si ton site n'est pas sur `qal.qiyoune.com`, ajoute son adresse dans la liste `ALLOWED` en haut de `google-auth.js`.
