# Mémoire du projet Rehook

Fichier de référence, à lire au début de chaque session et à compléter à chaque décision. Il remplace la mémoire de conversation, qui s'efface. Dépôt public : jamais de clé, de mot de passe ni de donnée privée ici.

Dernière mise à jour : 17 novembre 2026.

## 1. Qui, quoi

- Porteur : Fabrice (compte GitHub `khalidawi44`). Il écrit en français, veut des réponses courtes, des chemins de fichiers complets, et aucune invention (tout fait doit être vérifié).
- Produit : **Rehook**, outil qui repère les vidéos courtes qui explosent, aide à les refaire (recréation et montage) et à les publier. Objectif déclaré : « un vrai produit rentable », en dépôt public.
- E-mail du projet : **rehook.ai@gmail.com** (à utiliser pour créer les comptes des réseaux et les services).
- Dépôt : https://github.com/khalidawi44/rehook, branche `main`.
- Installation sur le PC de Fabrice (Windows) : **`E:\REHOOK`**. Lancement : raccourci « Rehook » du Bureau ou `E:\REHOOK\Rehook.cmd`. Diagnostic : `E:\REHOOK\Rehook-Diagnostic.cmd`. Journaux : `E:\REHOOK\data\lanceur.log`, `E:\REHOOK\data\rehook.err.log`, `E:\REHOOK\data\rehook.crash.log`. Clés : `E:\REHOOK\.env`.

## 2. Histoire courte

- 5 au 9 novembre 2026 : l'outil naît sous le nom « Niche » dans le dépôt `khalidawi44/lfi-nantes-clos-toreau` (dossier `niche/`, PR #205). Veille TikTok, recréation Remotion, montage façon CapCut, enregistreur d'écran, publication par Postiz, PWA mobile, lanceur Windows.
- 17 novembre 2026 : nouveau cap **GTA 6** (sortie le 19 novembre 2026, PS5 et Xbox Series, pas de version PC annoncée). Décision de sortir l'outil du dépôt LFI : dépôt dédié et public, nom **Rehook**, dossier `niche/` retiré du dépôt LFI, PR #205 fermée.
- 17 novembre 2026 : déplacement du dossier du Bureau vers `E:\REHOOK` (manque de place sur `C:`, et le Bureau synchronisé posait des erreurs d'installation).

## 3. Décisions prises

- **Nom du produit : Rehook** (Fabrice a choisi « rehook », pas « rehooked »). Plus aucune mention de « Niche ».
- **Plusieurs chaînes** dans l'outil (espaces de travail) : chacune a ses comptes suivis, hashtags, recherches et vidéos. Chaînes actuelles : « GTA 6 » et « Galerie des conneries » (compte personnel @galeriedesconneries et anciennes vidéos d'humour).
- **Chaînes étanches** (décision du 17/11/2026) : la chaîne « GTA 6 » repart vierge, elle ne contient que ce que ses comptes suivis relèvent. Tout l'ancien contenu (humour, glamour, fil varié) et le compte @galeriedesconneries vivent dans la chaîne « Galerie des conneries », avec les hashtags humour et glamour. Les compteurs, le fil et les listes sont propres à la chaîne active.
- Compte TikTok de la chaîne GTA 6 créé par Fabrice le 17/11/2026 (pseudo à confirmer).
- **Marque des chaînes GTA 6 : Leonida Daily**, pseudo visé `leonidadaily` partout, signature « GTA 6 en français, tous les jours ». Pas de « GTA » ni « Rockstar » dans le nom d'une chaîne.
- **Identité Rehook** : hameçon incliné avec œillet, accent corail `#FF4D4D`, fond `#0B0B10`, surfaces `#15151C`, police Anton pour le nom et les chiffres, Inter pour le reste. Fichiers dans `branding/rehooked/` (SVG et PNG). Fabrice a jugé la première icône « pas folle » ; la variante retenue est A2 (hameçon incliné), alternative D2 (« play accroché »).
- **Lives** : Fabrice a un téléphone, un PC et un compte Twitch. Trois montages décrits dans `docs/gta6-lancement.md` (console seule, PC avec boîtier d'acquisition et OBS, téléphone seul).
- **Modèle économique proposé** (pas encore validé par Fabrice) : gratuit limité, Créateur 19 €/mois, Pro 49 €/mois, Agence 149 €/mois, packs de niche à 9 €. Détail dans `docs/produit.md`.

## 4. Faits vérifiés (avec date)

- GTA 6 : sortie le 19/11/2026, préchargement depuis le 10/11, bonus de précommande avant le 20/11, État de Leonida, personnages Jason et Lucia, heure de déblocage non annoncée (boutique Rockstar, vérifié le 17/11/2026).
- Politique vidéo de Rockstar : usage non commercial toléré, pas de cinématiques isolées, pas de spoilers volontaires, jamais de leaks. À relire sur la page d'aide Rockstar avant de monétiser (page en erreur le 17/11, résumé d'après la presse).
- Comptes TikTok vérifiés le 17/11/2026 pour le pack GTA 6 : `rockstargames` (3,5 M), `rockstarintel` (20,5 k), `ign` (5,3 M), `jvcom` (362,9 k), `playstation` (6,5 M), `xbox` (9,8 M).
- Pseudos libres sur TikTok le 17/11/2026 : `leonidadaily`, `ruesdeleonida`, `sunsetleonida`, `leonida.story`, `vibeleonida`, `leonidagang`, `bienvenueleonida`, `rehooked`. Pris : `leonidafr`, `gta6fr`, `gta6actu`, `radioleonida`, `leonidatv`, `rehook` non vérifié.
- Domaines le 17/11/2026 : `rehook.com`, `rehook.app`, `rehook.io` pris ; `rehook.fr` libre ; `rehookapp.com`, `rehookapp.app`, `getrehook.app`, `getrehook.io` libres. `rehooked.app`, `.io`, `.fr` libres.
- Marques déposées (INPI, EUIPO) : **non vérifié**, à faire avant de vendre.

## 5. Limites connues de l'outil

- TikTok renvoie les pages hashtag et recherche vers son accueil sans compte connecté : la découverte fiable passe par les comptes suivis, la page Explorer (onglet Fil) et l'import d'URL.
- Le clic automatique sur les catégories de la page Explorer n'a jamais pu être testé hors du PC de Fabrice.
- La recréation et les idées de vidéos exigent `ANTHROPIC_API_KEY` dans `E:\REHOOK\.env`.
- Postiz (publication en un clic) : compte pas encore créé par Fabrice. Clé Pixabay : à vérifier.
- Le lanceur Windows ne peut pas être exécuté dans l'environnement de développement : toute modification de `launch.ps1` se teste chez Fabrice avec `E:\REHOOK\Rehook-Diagnostic.cmd`.
- Ne jamais lancer deux lanceurs en même temps (installation corrompue).

## 6. À faire

Côté Fabrice :
1. Créer les comptes Leonida Daily avec rehook.ai@gmail.com : TikTok, YouTube (demander la vérification tout de suite, le direct s'active 24 h après), Instagram, X, Snapchat, Facebook, Threads, régler Twitch. Dire où `leonidadaily` est pris.
2. Publier le visuel d'annonce (`branding/leonida-daily/`, à régénérer en « J-1 » ou « Jour J » selon le jour).
3. Réserver un domaine (voir partie 4) et vérifier les marques.
4. Supprimer `E:\GitHub\lfi-nantes-clos-toreau\niche` et la branche `rehook` du dépôt LFI.
5. Créer le compte Postiz et y connecter les chaînes.

Côté code :
1. Vérifier chez Fabrice que la chaîne GTA 6 ne montre plus d'humour après la mise à jour 3faa6a7.
2. Page d'accueil publique du produit (promesse, captures, liste d'attente).
3. Version hébergée multi-utilisateurs, paiement, paliers (feuille de route dans `docs/produit.md`).
4. Licence du dépôt public à trancher (AGPL-3.0 ou Business Source License), fichier `LICENSE` à poser.

## 7. Documents du dépôt

- `docs/produit.md` : nom, promesse, cibles, prix, design, feuille de route.
- `docs/gta6-lancement.md` : faits GTA 6, règles Rockstar, création des chaînes, bios, calendrier, lives.
- `branding/rehooked/` : identité du produit. `branding/leonida-daily/` : identité des chaînes GTA 6.
- `CLAUDE.md` : règles de travail du projet.
