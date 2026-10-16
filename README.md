# qal ✦

Compteur de calories IA simple et précis, en web app (PWA).
DA inspirée de [qiyoune.com](https://qiyoune.com).

- **Scan de codes-barres** → [Open Food Facts](https://fr.openfoodfacts.org) (énorme base de produits français)
- **Aliments bruts** → table officielle [Ciqual 2020 (ANSES)](https://ciqual.anses.fr), embarquée dans l'appli (`data/ciqual.json`, 2 298 aliments)
- **Questionnaire de départ** → calcule tes calories et macros (Mifflin-St Jeor + activité + objectif + appétit)
- **Macros + micros** (fibres, sucres, sel, calcium, fer, magnésium, vitamines…)
- **Aliments perso** pour les produits introuvables
- **Synchro Google Drive** (dossier caché de l'utilisateur, aucun serveur à toi)
- Marche hors ligne (sauf scan/recherche de produits qui ont besoin d'internet)

Aucune dépendance, aucun build : du HTML/CSS/JS pur. Tu modifies un fichier, tu recharges, c'est en ligne.

---

## 1. Mettre le projet sur GitHub

Dans le Terminal :

```bash
cd ~/Sites/qal
git init
git add .
git commit -m "qal v1"
git branch -M main
```

Puis crée le repo, au choix :

- **Avec GitHub CLI** (si `gh` est installé) : `gh repo create qal --public --source=. --push`
- **À la main** : crée un repo vide nommé `qal` sur [github.com/new](https://github.com/new) (sans README), puis :
  ```bash
  git remote add origin https://github.com/TON-PSEUDO/qal.git
  git push -u origin main
  ```

## 2. Mettre l'appli en ligne (GitHub Pages, gratuit)

1. Sur GitHub : ton repo → **Settings** → **Pages**
2. **Source** : *Deploy from a branch* → branche `main`, dossier `/ (root)` → **Save**
3. Au bout d'une minute, l'appli est sur `https://TON-PSEUDO.github.io/qal/`

> Le HTTPS est obligatoire pour la caméra : GitHub Pages le fournit d'office.

## 3. L'installer sur l'iPhone

1. Ouvre l'adresse dans **Safari**
2. Bouton **Partager** → **Sur l'écran d'accueil**
3. Elle s'ouvre en plein écran avec son icône, comme une vraie appli

## 4. Activer la synchro Google Drive (optionnel)

1. Va sur [console.cloud.google.com](https://console.cloud.google.com) → crée un projet `qal`
2. **API et services → Bibliothèque** → active **Google Drive API**
3. **Écran de consentement OAuth** (ou *Google Auth Platform*) :
   - type d'utilisateur **Externe**, nom de l'appli `qal`, ton e-mail
   - **Accès aux données / Scopes** : ajoute `.../auth/drive.appdata`
   - **Audience / Utilisateurs test** : ajoute ton adresse Gmail et celles de tes potes (100 max tant que l'appli est en mode test)
4. **Identifiants → Créer des identifiants → ID client OAuth**
   - type : **Application Web**
   - **Origines JavaScript autorisées** : `https://TON-PSEUDO.github.io`
5. Copie l'**ID client** (`xxxx.apps.googleusercontent.com`) dans `js/config.js`
6. `git commit -am "google sync" && git push`

Dans l'appli : **Profil → Synchro → Se connecter avec Google**.

Les données vont dans le dossier caché *appDataFolder* du Drive de chaque utilisateur : invisible dans ses fichiers, inaccessible pour toi, et ça utilise son espace à lui (quelques centaines de Ko).

## Mettre à jour l'appli

Après une modif : change `VERSION` dans `sw.js` (ex : `qal-v2`), puis `git commit -am "..." && git push`. Les téléphones récupèrent la nouvelle version à la prochaine ouverture.

## Structure

```
index.html            page unique
css/style.css         tout le design (couleurs en haut du fichier)
js/app.js             navigation entre les écrans
js/views/             écrans : onboarding, today (journal), add (scan/recherche), profile
js/sheets.js          fiche aliment, création d'aliment perso
js/store.js           données locales + fusion pour la synchro
js/nutrition.js       calculs (dépense, objectifs, repères micros)
js/foods.js           Ciqual + Open Food Facts
js/scanner.js         caméra + lecture code-barres
js/drive.js           synchro Google Drive
js/config.js          ID client Google
data/ciqual.json      table Ciqual compactée
vendor/               lecteur de codes-barres (barcode-detector + zxing-wasm, licence MIT)
fonts/alstoria.woff   police des titres (celle de qiyoune.com)
```

## Licences et crédits

- Produits : © contributeurs Open Food Facts, base sous licence **ODbL** (crédit obligatoire, déjà affiché dans le profil)
- Aliments bruts : **ANSES, table Ciqual 2020**, Licence Ouverte Etalab
- Lecteur de codes-barres : `barcode-detector` et `zxing-wasm` (MIT)
- ⚠️ **Police Alstoria** : vérifie sa licence avant de vendre l'appli (beaucoup de polices "display" sont gratuites seulement pour un usage perso). Elle ne contient que les lettres sans accents : les accents, chiffres et ponctuations des titres basculent automatiquement sur Fraunces (Google Fonts).

Les objectifs calculés sont des estimations, pas un avis médical.
