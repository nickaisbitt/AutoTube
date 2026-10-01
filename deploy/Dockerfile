# Multi-stage: small runtime layer for Railway snapshot export.
FROM node:22-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY deploy/bootstrap-server-render.mjs deploy/railway-shrink-runtime.mjs deploy/
COPY deploy/server-render deploy/server-render
RUN npm ci && node deploy/bootstrap-server-render.mjs

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY server.mjs ./
COPY server-render.mjs ./

ENV NODE_OPTIONS=--max-old-space-size=3072
# Skip prune/reinstall — registry deploy pulls the image; dev deps in node_modules are acceptable
RUN npm run build && node deploy/bootstrap-server-render.mjs

FROM node:22-bookworm AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip \
    && pip3 install --break-system-packages edge-tts==7.0.2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV AUTOTUBE_DISABLE_BROWSER_SEARCH=1

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.mjs ./
COPY --from=builder /app/server-render.mjs ./
COPY --from=builder /app/deploy ./deploy
RUN node deploy/bootstrap-server-render.mjs

EXPOSE 5173
CMD ["npx", "tsx", "server.mjs"]
