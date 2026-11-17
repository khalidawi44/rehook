# Rehook : repérer les vidéos virales, les recréer et les monter

Dépôt autonome : https://github.com/khalidawi44/rehook (projet indépendant, sans lien avec un autre dépôt).

Rehook est un tableau de bord local (Node 22, React, SQLite) qui :

1. **relève des vidéos TikTok** (hashtags, mots-clés, comptes suivis, URL importées) et garde un historique de leurs compteurs ;
2. **calcule pour chaque vidéo** : vues, vues par heure, croissance depuis le dernier relevé, engagement, et un verdict « Viral » ;
3. **recrée une vidéo** d'un clic : Claude analyse la source et écrit une variante (même format, même niche, histoire différente), puis Remotion rend un MP4 vertical 1080x1920 avec accroche, scènes, sous-titres karaoké, voix off et musique.

## Démarrer

**Windows, en un double-clic** : `Rehook.cmd` à la racine du dépôt (clic droit → Envoyer vers → Bureau pour avoir un raccourci). Il tourne sans fenêtre : à chaque lancement il met Rehook à jour depuis GitHub, installe ce qui manque, construit l'interface, démarre le serveur en arrière-plan et ouvre http://localhost:3001 dès que l'API répond. Si Rehook tourne déjà et qu'il n'y a pas de mise à jour, il ouvre juste l'onglet. Au premier lancement il ouvre `.env` dans le Bloc-notes pour la clé Anthropic. Fermer le dernier onglet Rehook (PC ou téléphone) arrête le serveur deux minutes plus tard, sauf si un rendu est en cours ; `Arreter-Rehook.cmd` l'arrête tout de suite. Journaux : `data\lanceur.log`, `data\rehook.log`, `data\rehook.err.log`. Il faut Node.js 22 ou plus et git.

**À la main (toutes plateformes)** :

```bash
git clone https://github.com/khalidawi44/rehook.git
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

Les miniatures TikTok expirent au bout de quelques heures : Rehook en garde une copie dans `data/covers/`.

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
3. **Visuels** (`NICHE_IMAGES`) : `stock-video` (recommandé ; clé Pixabay gratuite et immédiate sur pixabay.com/api/docs, et/ou clé Pexels) cherche pour chaque scène des clips vidéo libres de droits à partir d'une requête écrite par le modèle d'après le plan correspondant de la source ; le modèle choisit ensuite le clip le plus proche parmi les vignettes (en regardant les images clés de la source). Scène sans clip : photo Pexels en secours si la clé existe, sinon fond typographique. Autres valeurs : `pexels` (photos), `openai` (images générées), `none` (fonds typographiques). Les crédits des clips sont listés dans la fiche de la tâche et dans `credits.txt`.
4. **Voix off** (`NICHE_VOICE`) : `edge` (gratuit, sans clé, donne le minutage de chaque mot pour le karaoké), `openai`, `elevenlabs`, `piper` (local) ou `none`.
5. **Rendu** : Remotion (`src/video/Rehook.tsx`), 30 i/s, H.264. Le MP4 arrive dans `data/renders/` et se lit ou se télécharge depuis l'interface.

Depuis la fiche d'une recréation : copier la légende et les hashtags, refaire le rendu avec le même script, ou demander un nouveau script. La musique de fond se choisit parmi les fichiers déposés dans `data/public/music/` (vérifier la licence de ce qu'on y met).

Pour retoucher le rendu à l'œil : `npm run remotion:studio`.

## Sur un serveur cloud (accès de partout)

Voir `deploy/README.md` : une commande installe Rehook sur un VPS Ubuntu (Docker, Caddy avec HTTPS automatique, mot de passe `NICHE_PASSWORD`, mise à jour horaire depuis GitHub). La veille tourne alors 24 h/24, les alertes arrivent sur le téléphone, et l'appli s'installe sur l'écran d'accueil depuis n'importe où.

## Publier en un clic

Depuis une recréation terminée ou un export de montage, « 📣 Publier partout » ouvre la fenêtre de publication : Claude rédige description, accroche et hashtags adaptés à chaque réseau (TikTok, Instagram Reels, YouTube Shorts, Snapchat Spotlight, X, Facebook Reels, Threads), tout est modifiable et enregistré. Trois façons de publier :

- **En un clic** : avec un compte Postiz (postiz.com ou auto-hébergé) et `POSTIZ_API_KEY` dans `.env`, les réseaux connectés dans Postiz apparaissent avec une case à cocher ; « Publier maintenant » envoie la vidéo et le bon texte à chacun (TikTok en publication directe, YouTube avec titre et mots-clés, Instagram en Reel…), ou à l'heure choisie.
- **Depuis le téléphone** : « 📲 Partager » ouvre la feuille de partage avec la vidéo, le texte est copié dans le presse-papiers ; c'est la voie pour Snapchat, qui n'a pas d'API de publication.
- **À la main** : liens directs vers la page d'envoi de chaque réseau, le texte correspondant est copié au clic.

## Sur le téléphone (iPhone et Android)

Rehook est une PWA : même interface, même style. Réglages → « Sur le téléphone » affiche un QR code avec l'adresse du PC sur le Wi-Fi ; on le scanne, puis « Ajouter à l'écran d'accueil » (Partager sur iPhone, menu ⋮ sur Android) installe Rehook en plein écran avec son icône. Le PC doit rester allumé avec Rehook lancé ; si la page ne s'ouvre pas, autoriser Node.js dans le pare-feu Windows (réseau privé). Tout fonctionne depuis le téléphone (veille, alertes, lecteur, recréation, montage) sauf l'enregistreur d'écran du navigateur, remplacé par celui du système puis un import. Pour un accès hors de la maison : déployer le serveur sur un VPS ou passer par un tunnel (Tailscale).

## Lecteur intégré

La fiche d'une vidéo (clic sur une carte, bouton « Voir » d'une alerte) lit la vidéo d'origine dans Rehook : c'est le fichier mp4 que TikTok sert, donc sans les sous-titres ajoutés par le lecteur TikTok (seuls restent les textes incrustés par le créateur dans l'image). Le fichier est téléchargé une fois dans `data/analysis/<id>/` et resservi ensuite (`/api/videos/:id/media`). La fiche d'une recréation montre aussi l'original à côté du résultat.

## Montage

Onglet ✂️ Montage : un chutier (vidéos relevées, enregistrements et fichiers importés depuis le PC, recréations, musiques), une timeline et un aperçu qui enchaîne les clips avec les sous-titres et textes. Cinq outils :

- **Clip et effets** : début et fin (au curseur avec « Début ici » et « Fin ici », ou en secondes), coupe au curseur, vitesse x0,5 à x2, volume, son coupé, ordre, duplication, suppression, « extraire le son vers la musique ». Effets par clip : zoom avant ou arrière, punchy, noir et blanc, chaud, froid, vignette, netteté, miroir, fond flou, fondu entrée et sortie.
- **Musique** : import de fichiers (mp3, wav, m4a…, convertis en mp3 dans `data/public/music/`) ou son extrait d'un clip ; piste choisie, volume, départ dans la musique, fondus, et baisse automatique quand on parle (compresseur piloté par la voix).
- **Sous-titres** : génération automatique par transcription de la bande son du montage (Whisper en ligne si `OPENAI_API_KEY`, sinon Whisper local via transformers.js, modèle téléchargé une fois dans `data/models/`), liste modifiable (texte, début, fin), ajout au curseur, style karaoké mot à mot ou bloc, position, taille, couleurs, majuscules, fond. Incrustés à l'export (libass, police Anton).
- **Textes** : titres et mentions avec moment, taille, couleur, position et animation (pop, fondu).
- **Export** : format (1080x1920, 1080x1080, 1920x1080 ou libre), recadrage « remplir » ou « tout voir », transitions entre clips (fondu, fondu au noir, glissements, volets, cercle, pixels…), fondu global ; progression, lecture et téléchargement (`data/renders/montage-*.mp4`).

### Et aussi dans le montage

- **Modèles** (menu 🧩) : Storytime, Avant/Après, Top 3, Réaction, Teaser, Astuce : style de sous-titres, transition, textes et effets déjà réglés.
- **Annuler / rétablir** (Ctrl+Z, Ctrl+Y), sauvegarde automatique du montage en cours (repris à l'ouverture) et projets nommés (💾, menu 📁) dans `data/projects/`.
- **Timeline** : miniatures et onde sonore sur chaque clip, défilement en glissant, coupes en tirant les bords, raccourcis clavier ; aperçu en direct des effets, des sous-titres animés et des textes.
- **Clip** : « Couper les silences » (détection ffmpeg, le clip devient plusieurs morceaux parlés), « Recadrer sur les personnes » (détection locale des personnes sur trois images du clip, recadrage vertical centré sur elles à l'export).
- **Sous-titres animés** : mot qui grossit, surlignage coloré, rebond ; emojis automatiques sur les mots clés ; polices Anton, Permanent Marker, Rubik Spray Paint, Lobster ; hauteur réglable ; traduction des sous-titres en un clic.
- **Musique** : tempo détecté à l'import, « Caler les coupes sur le rythme » ajuste la fin de chaque clip sur un nombre entier de temps.
- **Couverture** : image à l'instant choisi avec un titre incrusté, exportée à côté du MP4 (vignette YouTube, couverture TikTok).

## Veille, planning et suivi

- Onglet Viral → « 📊 Ce qui marche dans ta niche » : hashtags, comptes et durées des vidéos virales de la période, heures de publication.
- Alerte 🏆 « record du compte » quand une vidéo fait au moins 3 fois la moyenne des 10 dernières du même compte.
- Onglet 📅 Planning : publications programmées via Postiz jour par jour, rappels Telegram 30 min avant, repères des meilleures heures par réseau, statistiques des posts envoyés (« 📈 Stats », via Postiz).
- Recréations : « 🌍 Version en… » refait la même vidéo dans une autre langue (script traduit, nouvelle voix, nouveau rendu).

## Enregistreur d'écran

Onglet 🎥 Enregistreur : choisir un écran, une fenêtre ou un onglet, puis régler la zone de capture (déplacer, redimensionner par le coin, ou tracer ; forme 9:16, carrée, 16:9 ou libre) et la taille de sortie (1080x1920, 1080x1080, 1920x1080, 720x1280 ou toute taille). Son du système si le navigateur le fournit, micro en option, 24 à 60 images par seconde. À l'arrêt : aperçu, téléchargement WebM, ou « Garder dans Rehook » qui convertit en MP4 H.264 (ffmpeg embarqué) dans `data/public/captures/`. Un enregistrement gardé se choisit ensuite comme fond des scènes sans clip dans la fenêtre « Recréer » (il défile d'une scène à l'autre). Chrome ou Edge conseillés.

## Arborescence

```
src/server/         API Express, base SQLite (node:sqlite), collecteurs, pipeline de recréation
  providers/        tiktok-page (page publique), tiktok-browser (Playwright), apify, demo
  recreate/         brief (Claude), images, voice, render (Remotion), index (file d'attente)
src/video/          composition Remotion « Rehook »
src/web/            interface React (Vite + Tailwind)
data/               base, miniatures, rendus, dossier public Remotion (ignoré par git sauf polices)
```

## Limites connues

- Pas d'API officielle TikTok : la découverte dépend d'un navigateur ou d'Apify, et TikTok peut bloquer. L'import d'URL et le rafraîchissement par page publique sont les voies les plus stables.
- Une seule recréation à la fois (file d'attente). Le premier rendu après démarrage prend 20 à 40 s de plus (bundle Remotion).
- Sans `ANTHROPIC_API_KEY`, tout fonctionne sauf l'étape script.
