# Le produit : Rehooked

Dossier rédigé le 17 novembre 2026. Tout ce qui est « libre » ci-dessous a été vérifié ce jour sur les registres (RDAP) et les pages publiques des plateformes.

## 1. Le nom

**Recommandation : Rehooked.** Le « hook », c'est les deux premières secondes d'une vidéo courte, celles qui décident si on reste. Le produit trouve les hooks qui marchent et aide à les refaire : « re-hooked ». Lisible en français comme en anglais, prononçable, verbe possible (« je rehook cette vidéo »).

| Nom | .app | .io | .fr | .com | TikTok | Remarque |
|---|---|---|---|---|---|---|
| **Rehooked** | libre | libre | libre | pris | @rehooked libre | tout est libre d'un coup, rare |
| Remakio | libre | libre | libre | pris | @remakio pris, @remakio.app libre | le plus clair en français (« remake ») |
| Echoreel | libre | libre | libre | pris | @echoreel pris (vide) | joli mais « reel » enferme sur Instagram |
| Reelsurge, Clipquake, Remakely, Surgeclip, Reeldrift | libre | libre | libre | pris | variable | solutions de repli |

Les .com sont pris pour tous les noms courts testés (une quarantaine). Pour un logiciel, `rehooked.app` est un bon domaine principal (HTTPS obligatoire sur .app, crédible), `rehooked.io` et `rehooked.fr` à prendre aussi pour protéger le nom. À réserver le jour même : les domaines libres partent vite.

Dépôt GitHub public : `khalidawi44/rehooked`. Pseudo à réserver partout à l'identique : `rehooked` (TikTok libre ; YouTube, Instagram, X à vérifier à la création).

## 2. La promesse

**Rehooked repère les vidéos courtes qui explosent dans ta niche, et t'aide à en faire ta version, prête à publier, en 10 minutes.**

Trois temps, un seul outil :
1. **Radar** : veille en continu (comptes, hashtags, fil par catégorie), alertes « ça explose » dans la minute, chiffres (vues, vues/heure, croissance, engagement), idées de vidéos à tourner.
2. **Atelier** : recréation guidée (analyse de la source, script, voix, images libres de droits, rendu vertical) et montage façon CapCut dans le navigateur (coupes, effets, transitions, sous-titres animés, musique, calques, fond vert).
3. **Diffusion** : publication en un clic partout (TikTok, Reels, Shorts, Snap, X, Facebook, Threads), textes et hashtags par réseau, planning, statistiques.

Ce que les concurrents font séparément (outils de veille d'un côté, outils de clips de l'autre, outils de publication ailleurs), Rehooked le fait dans un seul flux : trouver, refaire, publier.

## 3. Pour qui, et pourquoi ils paieraient

Cibles, dans l'ordre d'attaque :
1. **Créateurs solo francophones** qui vivent (ou veulent vivre) des vidéos courtes : gaming, humour, lifestyle, business. Ils paient déjà des outils de clips (15 à 30 euros par mois) et n'ont rien de sérieux pour la veille en français.
2. **Petites agences et community managers** qui gèrent 3 à 20 comptes : la veille multi-niches, les espaces de travail et la publication multi-comptes justifient un prix plus élevé.
3. **Marques et commerces** qui veulent coller aux tendances sans équipe vidéo.

Tête de pont : la sortie de GTA 6 (19 novembre 2026). La chaîne Leonida Daily sert de vitrine : chaque vidéo publiée est faite avec Rehooked, et le dit. Les créateurs gaming francophones sont la première communauté à convaincre, puis les autres niches par packs (humour, sport, beauté, business).

## 4. Le modèle économique

Abonnement mensuel, essai 7 jours sans carte, prix en euros TTC :

| Offre | Prix | Contenu |
|---|---|---|
| **Découverte** | gratuit | 1 niche, 5 comptes suivis, radar avec 1 h de retard, 3 recréations par mois, montage avec filigrane, export 720p |
| **Créateur** | 19 €/mois (190 €/an) | 3 niches, 50 comptes, alertes en temps réel, 30 recréations, montage sans filigrane 1080p, publication sur 5 réseaux, idées de vidéos |
| **Pro** | 49 €/mois (490 €/an) | niches et comptes illimités, 150 recréations, 3 espaces de travail (marques ou clients), publication illimitée, statistiques, accès API |
| **Agence** | 149 €/mois | 10 espaces, 5 utilisateurs, recréations illimitées, marque blanche sur les exports, support prioritaire |

Compléments : packs de niche vendus 9 € (comptes vérifiés, hashtags, modèles de montage), crédits de recréation supplémentaires, et plus tard des modèles de montage payants faits par des créateurs (partage de revenus).

Coûts à surveiller par utilisateur : appels au modèle (script, idées, choix des clips), rendu vidéo (CPU), stockage des vidéos sources, et la collecte TikTok. Les paliers de recréations servent précisément à garder une marge par abonné.

Objectifs : 100 abonnés payants à 3 mois (environ 2 500 € par mois), 500 à 12 mois. Un produit à 19 € vit avec quelques centaines d'abonnés, pas besoin de millions d'utilisateurs.

## 5. Ce qui doit changer dans le code pour en faire un produit

L'outil actuel est un outil personnel (un seul utilisateur, un mot de passe, tout sur un PC). Pour vendre :

1. **Version hébergée** (déjà amorcée : Docker, Caddy, HTTPS). Comptes utilisateurs, inscription par e-mail, espaces de travail, rôles. Base : passer de SQLite à PostgreSQL quand il y a plus d'un serveur.
2. **Paiement** : Stripe (abonnements, essai, portail client), paliers appliqués dans le code (compteurs de recréations, limites de comptes suivis).
3. **Collecte** : la lecture des pages publiques TikTok et le navigateur local ne tiennent pas à l'échelle et exposent à des blocages. Prévoir un collecteur serveur avec file d'attente, cache partagé entre utilisateurs (une vidéo relevée sert à tous ceux qui suivent la niche), et un fournisseur de données sous contrat (type Apify ou API officielle TikTok Research si éligible). Les conditions d'utilisation des plateformes sont le principal risque juridique du produit : à relire avec un conseil avant le lancement payant.
4. **Rendu** : file de rendus sur des machines dédiées, pas sur le serveur web. Un rendu Remotion de 30 s prend 40 à 90 s de CPU.
5. **Droits** : musiques libres de droits sous licence claire (bibliothèque fournie), clips Pixabay et Pexels (licences compatibles), modèles d'IA et voix avec conditions d'usage commercial.
6. **Garde-fous** : pas de téléchargement de la vidéo d'autrui pour la republier telle quelle (l'outil sert à refaire, pas à voler), filigrane en gratuit, signalement.
7. **Mesure** : événements d'usage (activation, première recréation, première publication), tableau de bord fondateur.
8. **Renommage** : « Rehook » devient Rehooked partout (interface, lanceur, PWA, dépôt). L'ancien lanceur Windows reste un mode « local » pour les utilisateurs avancés.

## 6. Le design

Direction : **sombre, net, une seule couleur d'accent**. L'interface actuelle (zinc sombre, accent vert) est déjà dans cette ligne ; on la pousse au niveau d'un produit.

- Palette : fond `#0B0B10`, surfaces `#15151C`, texte `#F2F2F5`, texte secondaire `#9A9AA6`, **accent corail `#FF4D4D`** (le hook : chaud, visible, rare dans les outils vidéo qui sont tous bleus ou violets), succès `#22C55E`, alerte `#F59E0B`.
- Typographie : Inter pour l'interface (lisible, neutre), Anton pour les gros chiffres et les titres de pages (le côté « ça claque » des vidéos courtes).
- Logo : un hameçon en trait continu qui se referme en boucle (re-hook), corail sur fond sombre, et le mot « rehooked » en minuscules. Fichiers dans `branding/rehooked/`.
- Principes : une action principale par écran (Recréer, Publier), chiffres gros et lisibles, miniatures grandes, tout au clavier dans le montage, mobile d'abord pour le radar (PWA existante), aucun texte creux.
- Voix de marque : tutoiement, phrases courtes, concret, humour sec, jamais de jargon marketing.

## 7. Feuille de route

| Étape | Quand | Quoi |
|---|---|---|
| 0. Vitrine | semaine du 17/11 | Dépôt public `rehooked`, nom et domaines réservés, page d'accueil (promesse, 3 captures, liste d'attente par e-mail), Leonida Daily publie « fait avec Rehooked » |
| 1. Renommage et base produit | 2 semaines | Rehook devient Rehooked, nettoyage du code, tests d'export, documentation, licence (code source public sous licence qui interdit la revente du service : voir ci-dessous) |
| 2. Hébergé multi-utilisateurs | 4 à 6 semaines | Comptes, espaces, Stripe, paliers, collecteur serveur avec cache partagé, file de rendus |
| 3. Bêta payante | janvier 2027 | 20 créateurs gaming et humour, prix fondateur 9 €/mois à vie pour les 100 premiers, retours hebdomadaires |
| 4. Lancement | février 2027 | Offres publiques, packs de niche, affiliation 30 % pour les créateurs qui recommandent |
| 5. Plus tard | 2027 | Instagram et YouTube Shorts dans le radar (pas seulement TikTok), modèles de montage vendus par des créateurs, application mobile native |

## 8. Dépôt public et licence

Dépôt public, donc : **jamais une clé dans le code** (`.env` ignoré, `.env.example` seulement), pas de données d'utilisateurs, pas de vidéos sources commitées. Le code source est visible, mais la licence protège le produit : licence « source disponible » de type **Business Source License 1.1** ou **AGPL-3.0** (AGPL oblige quiconque héberge une version modifiée à publier son code, ce qui décourage les copies commerciales). À trancher avant de rendre le dépôt public ; en attendant, un fichier `LICENSE` AGPL-3.0 est posé.

Structure visée du dépôt :

```
rehooked/
  apps/web        interface (React, Vite, Tailwind)
  apps/api        serveur (Express, base, collecte, rendus)
  packages/video  compositions Remotion
  packages/edit   moteur de montage ffmpeg
  deploy/         Docker, Caddy, scripts serveur
  branding/       logo, couleurs, visuels
  docs/           produit, lancement GTA 6, guides
```

## 9. Les trois premiers chiffres à suivre

1. **Activation** : part des inscrits qui font une première recréation ou un premier montage dans les 24 h (objectif 40 %).
2. **Rétention à 4 semaines** : part des abonnés encore actifs (objectif 60 %).
3. **Revenu mensuel récurrent** et coût par abonné (modèle, rendu, données), pour garder au moins 70 % de marge brute.
