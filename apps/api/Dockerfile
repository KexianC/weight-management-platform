FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build:release
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev --no-audit --no-fund --prefer-offline
COPY --from=build /app/dist-release ./dist
COPY scripts/preflight-production.mjs ./scripts/preflight-production.mjs
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 3000
# Migration is an explicit operator step after backup, never an automatic startup write.
CMD ["sh","-c","node scripts/preflight-production.mjs && exec node dist/main.js"]
