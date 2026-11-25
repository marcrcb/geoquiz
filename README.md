# Géo Quiz — carte, drapeaux & capitales

Application web **100 % hors ligne** (PWA) pour apprendre la géographie, prête pour GitHub Pages.

## Les jeux

| Jeu | Modes |
| --- | --- |
| 01 **Carte du monde** | **Tout nommer** : tape les pays, ils apparaissent sur la carte · **Localiser** : un pays est demandé, clique dessus (3 essais) |
| 02 **Drapeaux** | **Tous les drapeaux** (grille) · **Un par un** avec indices et « passer » |
| 03 **Capitales** | **Liste complète** · **Un par un** — dans les deux sens (pays → capitale ou capitale → pays) · **Sur la carte** : clique l’emplacement de la capitale, réussi à moins de 300 km |
| 04 **Silhouettes** | **Un par un** ou **Toutes les silhouettes** : reconnaître un pays à sa forme (164 pays ; micro-États et archipels trop dispersés exclus) |
| 05 **Pays voisins** | Un pays s’affiche : nommer tous ceux qui partagent une frontière terrestre avec lui (10, 25 ou tous les pays) |
| 06 **À l’échelle** | Deux silhouettes à la même échelle, posées côte à côte : le 1er pays sert de repère fixe, on agrandit ou rétrécit librement le 2e (glisser, pincer, molette, flèches, boutons) puis on valide. Chaque manche est notée sur 100 (100 si exact, 50 si la surface est 2 fois trop grande ou trop petite, 0 au-delà de 4 fois) ; 5 ou 10 manches
| 07 **Chemin** | Relier deux pays par une suite de voisins, en un minimum d’étapes (bouton Retour, trajet optimal révélé si on passe) |

### Atlas

Carte libre, hors des jeux : noms des pays et des capitales qui apparaissent selon le zoom (sans chevauchement), recherche par pays ou par capitale, et une fiche au clic sur un pays : drapeau, nom et variantes acceptées, capitale (et variantes), continent, position de la capitale, voisins terrestres cliquables, silhouette, codes ISO.

Dans les grilles, une **case active** est surlignée : la réponse n’est acceptée que pour cette case, puis on passe automatiquement à la suivante. Clic sur une case pour la choisir, Tab / Maj+Tab ou « Passer » pour se déplacer ; les cases déjà trouvées sont sautées.

Pour chaque partie : région (Monde, Europe, Afrique, Asie, Amérique du Nord, Amérique du Sud, Océanie), chrono ou sans limite, records sauvegardés sur l’appareil.

**Pause** : bouton ⏸ à côté du chrono (ou Échap quand la saisie est vide ; Échap/Entrée pour reprendre). Le chrono s’arrête, la progression est conservée et le plateau est masqué. La partie se met aussi en pause toute seule quand on change d’onglet ou d’application.

- Saisie tolérante : accents, majuscules, tirets et articles ignorés ; variantes acceptées (Birmanie/Myanmar, Kiev/Kyiv, RDC…).
- Quand un nom est le début d’un autre (Niger → Nigeria, Soudan → Soudan du Sud), l’appli attend une seconde avant de valider.
- Carte interactive : zoom molette/pincement, déplacement, micro-États en pastilles cliquables, légende par continent.
- Interface sobre en noir et blanc (seuls les drapeaux sont en couleur), pensée pour rester fluide à 60 images/s, y compris sur téléphone.

## Données (à jour 2026)

- **197 pays** : les 193 membres de l’ONU + Vatican, Palestine, Kosovo, Taïwan.
- Carte : Natural Earth 1:50m (`world-atlas`), Somaliland fusionné avec la Somalie, Chypre du Nord avec Chypre.
- Drapeaux : `flag-icons` (SVG), avec des vignettes WebP pré-calculées pour les grilles.
- Frontières terrestres : `world-countries`, restreintes aux 197 pays (frontière maritime Inde – Sri Lanka retirée).
- Coordonnées des capitales : GeoNames (`scripts/capitales-coords.json`), Ciudad de la Paz ajoutée à la main.
- Silhouettes : pré-calculées au build (`data/shapes.js`), territoire principal uniquement (sans Guyane, Hawaï, île de Pâques…). Noms et capitales en français : `scripts/pays.txt` (ex. Ciudad de la Paz, nouvelle capitale de la Guinée équatoriale depuis janvier 2026 ; Malabo reste accepté).

## Développement

```bash
npm install
npm run build   # régénère data/, flags/ (SVG + vignettes), vendor/, fonts/ et precache.js
npm run serve   # http://localhost:8080
```

Pour corriger un nom ou une capitale : modifier `scripts/pays.txt` puis `npm run build` (le cache hors ligne est mis à jour automatiquement grâce à la version calculée).

## Publication sur GitHub Pages

Les fichiers générés sont commités : aucun build n’est nécessaire côté GitHub.
*Settings → Pages → Deploy from a branch → `main` / `(root)`*.
