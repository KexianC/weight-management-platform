FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev --no-audit --no-fund --prefer-offline
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh","-c","node scripts/preflight-production.mjs && npm run prisma:migrate && exec node dist/main.js"]
