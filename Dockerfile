FROM node:22-alpine AS builder

RUN apk add --no-cache --virtual .build-deps \
    build-base \
    cairo-dev \
    pango-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    python3 \
    && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/tsconfig*.json ./

RUN mkdir -p /app/test-recordings /app/tmp /app/output

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:${PORT:-5173}/api/health || exit 1

CMD ["npx", "tsx", "server.mjs"]
