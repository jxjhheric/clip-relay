# ---- Base Stage ----
FROM node:20-alpine AS base

WORKDIR /app

# Install system dependencies required at runtime
RUN apk add --no-cache openssl

# ---- Dependencies Stage ----
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder Stage ----
FROM deps AS builder

COPY . .

RUN npm run build

# Remove development-only dependencies and caches
RUN npm prune --omit=dev \
  && rm -rf .next/cache \
  && npm cache clean --force

# ---- Runner Stage ----
FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# The database file itself should be mounted as a volume,
# but the directory needs to exist.
RUN mkdir -p /app/db

EXPOSE 3000

CMD ["npm", "start"]
