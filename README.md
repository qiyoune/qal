# qal ✦

Compteur de calories IA simple et précis, en web app (PWA).

- **Scan de codes-barres** → [Open Food Facts](https://fr.openfoodfacts.org) (énorme base de produits français)
- **Aliments bruts** → table officielle [Ciqual 2020 (ANSES)](https://ciqual.anses.fr), embarquée dans l'appli (`data/ciqual.json`, 2 298 aliments)
- **Questionnaire de départ** → calcule tes calories et macros (Mifflin-St Jeor + activité + objectif + appétit)
- **Macros + micros** (fibres, sucres, sel, calcium, fer, magnésium, vitamines…)
- **Aliments perso** pour les produits introuvables
- **Synchro Google Drive** (dossier caché de l'utilisateur, aucun serveur à toi)
- Marche hors ligne (sauf scan/recherche de produits qui ont besoin d'internet)

Aucune dépendance, aucun build : du HTML/CSS/JS pur. Tu modifies un fichier, tu recharges, c'est en ligne.

```

## Licences et crédits

- Produits : © contributeurs Open Food Facts, base sous licence **ODbL** (crédit obligatoire, déjà affiché dans le profil)
- Aliments bruts : **ANSES, table Ciqual 2020**, Licence Ouverte Etalab
- Lecteur de codes-barres : `barcode-detector` et `zxing-wasm` (MIT)
- ⚠️ **Police Alstoria** : vérifie sa licence avant de vendre l'appli (beaucoup de polices "display" sont gratuites seulement pour un usage perso). Elle ne contient que les lettres sans accents : les accents, chiffres et ponctuations des titres basculent automatiquement sur Fraunces (Google Fonts).

Les objectifs calculés sont des estimations, pas un avis médical.
