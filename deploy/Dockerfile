# Multi-stage: small runtime layer for Railway snapshot export.
FROM node:22-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY deploy/bootstrap-server-render.mjs deploy/bootstrap-server-render.mjs
COPY deploy/server-render deploy/server-render
RUN npm ci && node deploy/bootstrap-server-render.mjs

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY server.mjs scripts/railway-shrink-runtime.mjs ./

ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build:railway

FROM node:22-bookworm AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium python3 python3-pip \
    && pip3 install --break-system-packages edge-tts==7.0.2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.mjs ./
COPY --from=builder /app/deploy ./deploy
RUN node deploy/bootstrap-server-render.mjs

EXPOSE 5173
CMD ["npx", "tsx", "server.mjs"]
