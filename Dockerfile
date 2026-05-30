FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 5173
CMD ["npx", "tsx", "server.mjs"]
