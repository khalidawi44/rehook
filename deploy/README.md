# Rehook sur un serveur (accès de partout, veille 24 h/24)

## Ce qu'il faut
- Un VPS Ubuntu 22.04 ou 24.04 avec **4 Go de RAM** et 40 Go de disque (Hetzner CX22, OVH VPS, Scaleway… 5 à 10 € par mois).
- En option, un nom de domaine (ex. `niche.mondomaine.fr`) avec un enregistrement A vers l'IP du serveur : Caddy obtient alors le certificat HTTPS tout seul. Sans domaine, Rehook répond en HTTP sur l'IP (la PWA et le partage depuis le téléphone exigent HTTPS : prends un domaine, même à 3 €).

## Installation (une commande, en root sur le serveur)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/khalidawi44/rehook/main/deploy/install.sh)
```

Le script installe Docker, clone le dépôt dans `/opt/rehook`, pose les questions (domaine, mot de passe, clés) et écrit `.env`, construit l'image (Node 22 + Chromium) et démarre Rehook derrière Caddy. Il ajoute aussi une tâche horaire (`/etc/cron.hourly/rehook-update`) qui met Rehook à jour depuis GitHub : même automatisme que le lanceur Windows.

## Au quotidien
- Ouvrir `https://ton-domaine` (ou `http://IP`), entrer le mot de passe, puis sur le téléphone « Ajouter à l'écran d'accueil ».
- Journal : `docker compose -f /opt/rehook/deploy/docker-compose.yml logs -f niche`
- Mise à jour forcée : `/opt/rehook/deploy/update.sh`
- Changer un réglage : éditer `/opt/rehook/.env` puis `cd /opt/rehook/deploy && docker compose --env-file ../.env up -d`
- Données (base, vidéos, rendus, modèles) : `/opt/rehook/data`, à sauvegarder.

## Détails
- `Dockerfile` : image officielle Playwright (Chromium et ses bibliothèques, utilisés par la découverte TikTok et par Remotion), `npm ci`, construction de l'interface.
- `docker-compose.yml` : service `niche` (port 3001 interne, volume `data/`) et `caddy` (80 et 443, certificat automatique).
- `NICHE_PASSWORD` active la page de connexion ; `NICHE_BEHIND_PROXY=1` fait confiance à Caddy pour l'adresse et le HTTPS.
