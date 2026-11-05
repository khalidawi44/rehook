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
| Veille | automatique (`watchMinutes`, 2 min) ou bouton Actualiser | Relit les pages des vidéos récentes : chaque relevé donne « Vues/h » et « Croissance », et déclenche les alertes. |
| Comptes suivis, hashtags, mots-clés | onglet Comptes et Réglages | Découverte via `NICHE_DISCOVERY` : `browser` (Chromium local via Playwright, gratuit) ou `apify` (acteur clockworks/tiktok-scraper, payant, robuste). |

Pour le mode `browser` : `npx playwright install chromium` une fois. TikTok peut demander une vérification et renvoyer 0 vidéo ; dans ce cas le journal du relevé (Réglages) le dit, et le mode `apify` ou l'import d'URL restent disponibles.

Les miniatures TikTok expirent au bout de quelques heures : Niche en garde une copie dans `data/covers/`.

## Veille en continu et alertes

Deux boucles tournent tant que `npm run dev` (ou `npm start`) est lancé :

- **Découverte** (`discoveryMinutes`, 15 min par défaut) : nouvelles vidéos des comptes suivis, des hashtags et des mots-clés.
- **Relevé des compteurs** (`watchMinutes`, 2 min par défaut) : les vidéos publiées depuis moins de `watchHours` (72 h) sont relues ; chaque passage ajoute un relevé, d'où « Vues/h » et « Croissance » au fil de l'eau.

Après chaque relevé, la règle d'alerte compare le rythme du dernier intervalle au précédent :

- 🔥 **nouvelle** : vidéo découverte à l'instant, de moins de 24 h, déjà au-dessus des seuils ;
- 🚀 **explose** : au-dessus de `alertMinViews` et `alertMinViewsPerHour`, et rythme au moins 1,8 fois celui de l'intervalle d'avant (une alerte par vidéo par 6 h) ;
- ⚡ **accélère** : rythme triplé depuis la dernière alerte.

Les alertes s'affichent dans l'onglet 🚨 Alertes (badge rouge, bip, notification du navigateur si autorisée) et partent sur Telegram si `NICHE_TELEGRAM_BOT_TOKEN` et `NICHE_TELEGRAM_CHAT_ID` sont renseignés (bot via @BotFather, chat_id obtenu avec `https://api.telegram.org/bot<token>/getUpdates` après lui avoir écrit).

## Pack de démarrage

Au premier lancement, le pack `NICHE_PACK` (défaut `humour-fr`, dans `src/server/packs/`) est chargé : comptes d'humour francophones vérifiés passés en « suivis », hashtags, et quelques vidéos qui ont explosé. La découverte démarre dans la foulée. Un pack se recharge depuis Réglages. Mettre `NICHE_PACK=` vide pour partir des données de démonstration à la place.

## Le verdict « Viral »

Une vidéo de moins de 7 jours est virale si :

- elle dépasse le minimum de vues **et** le minimum de vues par heure (réglables), ou
- elle fait plus de N fois la médiane des vues de son compte (il faut au moins 3 vidéos du compte).

« Virales aujourd'hui » compte celles publiées depuis 24 h. Le filtre « Comptes non suivis » inclut les vidéos trouvées par hashtag ou mot-clé sur des comptes que vous ne suivez pas.

## Recréer cette vidéo

Chaque recréation passe par cinq étapes, visibles dans l'onglet Recréations :

1. **Analyse de la vidéo source** : le fichier est téléchargé depuis TikTok, découpé en images clés (ffmpeg embarqué), et la transcription vient des sous-titres automatiques TikTok (ou de Whisper si `OPENAI_API_KEY` est renseignée et que TikTok n'en a pas). Le texte incrusté à l'écran est lu aussi. Le tout est gardé dans `data/analysis/`.
2. **Script** (Claude, modèle `NICHE_MODEL`, défaut `claude-opus-5-5`) : images clés, transcription, texte incrusté, légende, hashtags, durée et stats sont envoyés ; le modèle décrit d'abord ce qui se passe dans la source et son mécanisme, puis renvoie une variante au même mécanisme (accroche, scènes avec narration, texte à l'écran et visuel, légende, hashtags, palette). Un sketch joué par des personnes est marqué « tournage » : les scènes deviennent un script à filmer, et la vidéo rendue sert de maquette.
3. **Images** (`NICHE_IMAGES`) : `none` (fonds typographiques animés), `pexels` (photos libres, clé gratuite) ou `openai` (images générées).
4. **Voix off** (`NICHE_VOICE`) : `edge` (gratuit, sans clé, donne le minutage de chaque mot pour le karaoké), `openai`, `elevenlabs`, `piper` (local) ou `none`.
5. **Rendu** : Remotion (`src/video/Niche.tsx`), 30 i/s, H.264. Le MP4 arrive dans `data/renders/` et se lit ou se télécharge depuis l'interface.

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
