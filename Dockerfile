# Lean production image — explicit COPY avoids multi‑GB Railpack context export hangs.
FROM node:22-bookworm AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    ffmpeg chromium \
    build-essential pkg-config \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
    && pip3 install --break-system-packages edge-tts==7.0.2 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY deploy/bootstrap-server-render.mjs deploy/bootstrap-server-render.mjs
COPY deploy/server-render deploy/server-render

ENV NODE_OPTIONS=--max-old-space-size=3072
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium

RUN npm ci && node deploy/bootstrap-server-render.mjs

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY server.mjs deploy/server-render.mjs ./

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    ffmpeg chromium \
    build-essential pkg-config \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
    && pip3 install --break-system-packages edge-tts==7.0.2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium

COPY package.json package-lock.json ./
COPY deploy/bootstrap-server-render.mjs deploy/bootstrap-server-render.mjs
COPY deploy/server-render deploy/server-render

RUN npm ci --omit=dev && node deploy/bootstrap-server-render.mjs

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/server-render.mjs ./server-render.mjs

EXPOSE 5173
CMD ["npx", "tsx", "server.mjs"]
