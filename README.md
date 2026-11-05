# Niche : repérer les vidéos virales et les recréer avec Remotion

Niche est un tableau de bord local (Node 22, React, SQLite) qui :

1. **relève des vidéos TikTok** (hashtags, mots-clés, comptes suivis, URL importées) et garde un historique de leurs compteurs ;
2. **calcule pour chaque vidéo** : vues, vues par heure, croissance depuis le dernier relevé, engagement, et un verdict « Viral » ;
3. **recrée une vidéo** d'un clic : Claude analyse la source et écrit une variante (même format, même niche, histoire différente), puis Remotion rend un MP4 vertical 1080x1920 avec accroche, scènes, sous-titres karaoké, voix off et musique.

## Démarrer

```bash
cd niche
npm install
cp .env.example .env     # mettre au moins ANTHROPIC_API_KEY
npm run dev              # API sur :3001, interface sur http://localhost:5173
```

En production : `npm run build` puis `npm start` (l'API sert aussi l'interface compilée sur le port 3001).

La première ouverture charge 16 vidéos de démonstration (comptes `demo_…`) pour voir l'interface. Elles se retirent dans Réglages.

## Trouver les vidéos

| Source | Réglage | Ce que ça fait |
| --- | --- | --- |
| Import d'URL | bouton « Importer une URL » | Lit la page publique de la vidéo (légende, auteur, durée, stats). Sans clé, sans navigateur. |
| Rafraîchissement | automatique (`NICHE_REFRESH_MINUTES`) ou bouton Actualiser | Relit les pages des vidéos de moins de 7 jours : chaque relevé donne « Vues/h » et « Croissance ». |
| Comptes suivis, hashtags, mots-clés | onglet Comptes et Réglages | Découverte via `NICHE_DISCOVERY` : `browser` (Chromium local via Playwright, gratuit) ou `apify` (acteur clockworks/tiktok-scraper, payant, robuste). |

Pour le mode `browser` : `npx playwright install chromium` une fois. TikTok peut demander une vérification et renvoyer 0 vidéo ; dans ce cas le journal du relevé (Réglages) le dit, et le mode `apify` ou l'import d'URL restent disponibles.

Les miniatures TikTok expirent au bout de quelques heures : Niche en garde une copie dans `data/covers/`.

## Le verdict « Viral »

Une vidéo de moins de 7 jours est virale si :

- elle dépasse le minimum de vues **et** le minimum de vues par heure (réglables), ou
- elle fait plus de N fois la médiane des vues de son compte (il faut au moins 3 vidéos du compte).

« Virales aujourd'hui » compte celles publiées depuis 24 h. Le filtre « Comptes non suivis » inclut les vidéos trouvées par hashtag ou mot-clé sur des comptes que vous ne suivez pas.

## Recréer cette vidéo

Chaque recréation passe par quatre étapes, visibles dans l'onglet Recréations :

1. **Analyse et script** (Claude, modèle `NICHE_MODEL`, défaut `claude-opus-5-5`) : la miniature, la légende, les hashtags, la durée et les stats sont envoyées ; le modèle renvoie un brief structuré (pourquoi ça marche, accroche, scènes avec narration, texte à l'écran et visuel, légende, hashtags, palette).
2. **Images** (`NICHE_IMAGES`) : `none` (fonds typographiques animés), `pexels` (photos libres, clé gratuite) ou `openai` (images générées).
3. **Voix off** (`NICHE_VOICE`) : `edge` (gratuit, sans clé, donne le minutage de chaque mot pour le karaoké), `openai`, `elevenlabs`, `piper` (local) ou `none`.
4. **Rendu** : Remotion (`src/video/Niche.tsx`), 30 i/s, H.264. Le MP4 arrive dans `data/renders/` et se lit ou se télécharge depuis l'interface.

Depuis la fiche d'une recréation : copier la légende et les hashtags, refaire le rendu avec le même script, ou demander un nouveau script. La musique de fond se choisit parmi les fichiers déposés dans `data/public/music/` (vérifier la licence de ce qu'on y met).

Pour retoucher le rendu à l'œil : `npm run remotion:studio`.

## Arborescence

```
src/server/         API Express, base SQLite (node:sqlite), collecteurs, pipeline de recréation
  providers/        tiktok-page (page publique), tiktok-browser (Playwright), apify, demo
  recreate/         brief (Claude), images, voice, render (Remotion), index (file d'attente)
src/video/          composition Remotion « Niche »
src/web/            interface React (Vite + Tailwind)
data/               base, miniatures, rendus, dossier public Remotion (ignoré par git sauf polices)
```

## Limites connues

- Pas d'API officielle TikTok : la découverte dépend d'un navigateur ou d'Apify, et TikTok peut bloquer. L'import d'URL et le rafraîchissement par page publique sont les voies les plus stables.
- Une seule recréation à la fois (file d'attente). Le premier rendu après démarrage prend 20 à 40 s de plus (bundle Remotion).
- Sans `ANTHROPIC_API_KEY`, tout fonctionne sauf l'étape script.
