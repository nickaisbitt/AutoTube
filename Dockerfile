# Single-stage image: one apt layer + vite build (avoids 50min double-install timeouts on Railway).
FROM node:22-bookworm
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    ffmpeg chromium \
    build-essential pkg-config \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
    && pip3 install --break-system-packages edge-tts==7.0.2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_OPTIONS=--max-old-space-size=3072
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY deploy/bootstrap-server-render.mjs deploy/bootstrap-server-render.mjs
COPY deploy/server-render deploy/server-render

RUN npm ci && node deploy/bootstrap-server-render.mjs

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY server.mjs deploy/server-render.mjs ./

RUN npm run build && npm prune --omit=dev

EXPOSE 5173
CMD ["npx", "tsx", "server.mjs"]
