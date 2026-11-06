# Niche en conteneur : Node 22 + Chromium (image officielle Playwright, mêmes dépendances que Remotion).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=3001

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Remotion télécharge son Chrome headless au premier rendu ; on le fait à la construction.
RUN npx remotion browser ensure || true

VOLUME ["/app/data"]
EXPOSE 3001
CMD ["npx", "tsx", "src/server/index.ts"]
