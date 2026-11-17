#!/usr/bin/env bash
# Installation de Niche sur un serveur Ubuntu 22.04 ou 24.04 (VPS 4 Go de RAM conseillés).
# Usage, en root sur le serveur :  bash <(curl -fsSL https://raw.githubusercontent.com/khalidawi44/niche/main/deploy/install.sh)
set -euo pipefail
REPO="${NICHE_REPO:-https://github.com/khalidawi44/niche.git}"
BRANCH="${NICHE_BRANCH:-main}"
DIR="${NICHE_DIR:-/opt/niche}"

echo "== Niche : installation dans $DIR"
if ! command -v docker >/dev/null 2>&1; then
  echo "-- Installation de Docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v git >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq git; fi

if [ ! -d "$DIR/.git" ]; then
  git clone --depth 50 --branch "$BRANCH" "$REPO" "$DIR"
else
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" reset --hard "origin/$BRANCH"
fi
cd "$DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "== Réglages (Entrée pour laisser vide)"
  read -rp "Nom de domaine pointant vers ce serveur (ex. niche.mondomaine.fr ; vide = HTTP sur l'IP) : " DOMAIN
  read -rp "Mot de passe d'accès à Niche (obligatoire sur Internet) : " PASSWORD
  read -rp "Clé API Anthropic (sk-ant-…) : " ANTHROPIC
  read -rp "Identifiant de workspace Anthropic (wrkspc_…, vide si clé de workspace) : " WORKSPACE
  read -rp "Clé Pixabay (clips libres de droits, vide pour plus tard) : " PIXABAY
  read -rp "Jeton du bot Telegram pour les alertes (vide pour plus tard) : " TGTOKEN
  read -rp "Chat id Telegram : " TGCHAT
  {
    echo "NICHE_DOMAIN=${DOMAIN}"
    echo "NICHE_PASSWORD=${PASSWORD}"
    echo "ANTHROPIC_API_KEY=${ANTHROPIC}"
    echo "ANTHROPIC_WORKSPACE_ID=${WORKSPACE}"
    echo "PIXABAY_API_KEY=${PIXABAY}"
    echo "NICHE_TELEGRAM_BOT_TOKEN=${TGTOKEN}"
    echo "NICHE_TELEGRAM_CHAT_ID=${TGCHAT}"
    echo "NICHE_DISCOVERY=browser"
    echo "NICHE_IMAGES=stock-video"
    echo "NICHE_VOICE=edge"
    echo "NICHE_PACK=humour-fr"
  } >> .env
fi

echo "== Construction et démarrage (quelques minutes la première fois)"
cd deploy
docker compose --env-file ../.env up -d --build

# Mise à jour automatique toutes les heures (git + reconstruction si nouveau commit).
cat > /etc/cron.hourly/niche-update <<CRON
#!/usr/bin/env bash
exec $DIR/deploy/update.sh >> /var/log/niche-update.log 2>&1
CRON
chmod +x /etc/cron.hourly/niche-update

DOMAIN=$(grep -E '^NICHE_DOMAIN=' ../.env | cut -d= -f2-)
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
echo
echo "== Niche tourne."
if [ -n "$DOMAIN" ]; then echo "   https://$DOMAIN  (le certificat arrive en moins d'une minute)"; else echo "   http://$IP"; fi
echo "   Journal : docker compose -f $DIR/deploy/docker-compose.yml logs -f niche"
