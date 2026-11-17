# Règles du projet Rehook

**À chaque début de session : lire `docs/MEMOIRE.md`** (décisions, faits vérifiés, chemins, à faire). **À chaque décision de Fabrice ou fait nouveau vérifié : le noter dans `docs/MEMOIRE.md`, commité et poussé dans le même geste.** C'est la mémoire du projet, celle de la conversation s'efface.

Rehook est un outil personnel de veille TikTok, de recréation (Remotion) et de montage, orienté depuis le 17/11/2026 sur le lancement de GTA 6 (chaînes « Leonida Daily »). Projet indépendant : aucun lien avec les dépôts associatifs ou politiques du même compte GitHub.

## Vérifier avant de livrer (règle absolue)
- Ne jamais inventer un pseudo, un chiffre, une date, une règle de plateforme : vérifier sur la page publique (TikTok : `fetchTikTokProfile`), sinon le dire.
- Pas de leaks ni de contenu pré-sortie non officiel de GTA 6 dans les visuels, scripts ou posts générés.
- Les textes affichés se lisent comme écrits par un humain : jamais de tiret long « — » ni moyen « – » (virgule, deux-points ou tiret simple), pas de formules creuses, aucune mention d'une IA. Contrôle : `grep -rn "[—–]" src` sur les chaînes ajoutées.

## Code
- Branche de travail : `main` (le lanceur Windows `launch.ps1` et la mise à jour depuis l'outil suivent la branche courante du clone).
- Avant chaque push : `npx tsc --noEmit -p .` et `npm run build` passent ; les exports ffmpeg nouveaux sont testés sur une vraie vidéo (`data/renders`).
- Clés et jetons uniquement dans `.env` (ignoré par git), jamais dans le code ni dans la conversation.
- Chemins pour l'utilisateur : toujours complets (ex. `E:\REHOOK\data\lanceur.log`).

## Données
- Tout ce qui est relevé (vidéos, comptes, rendus, captures, musiques) vit dans `data/` : à sauvegarder, jamais commité.
- Les packs de démarrage (`src/server/packs/*.json`) ne contiennent que des comptes vérifiés, avec la date de vérification dans la description.
