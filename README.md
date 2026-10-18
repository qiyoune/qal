# qal ✦

Compteur de calories IA simple et précis, en web app (PWA).

- **Scan de codes-barres** → [Open Food Facts](https://fr.openfoodfacts.org) (énorme base de produits français)
- **Aliments bruts** → table officielle [Ciqual 2020 (ANSES)](https://ciqual.anses.fr), embarquée dans l'appli (`data/ciqual.json`, 2 298 aliments)
- **Questionnaire de départ** → calcule tes calories et macros (Mifflin-St Jeor + activité + objectif + appétit)
- **Macros + micros** (fibres, sucres, sel, calcium, fer, magnésium, vitamines…)
- **Aliments perso** pour les produits introuvables
- **Synchro Google Drive** (dossier caché de l'utilisateur, aucun serveur à toi)
- Marche hors ligne (sauf scan/recherche de produits qui ont besoin d'internet)

```

## Licences et crédits

- Produits : © contributeurs Open Food Facts, base sous licence **ODbL** (crédit obligatoire, déjà affiché dans le profil)
- Aliments bruts : **ANSES, table Ciqual 2020**, Licence Ouverte Etalab
- Lecteur de codes-barres : `barcode-detector` et `zxing-wasm` (MIT)

Les objectifs calculés sont des estimations, pas un avis médical.
