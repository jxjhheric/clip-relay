# ---- Base Stage ----
FROM node:20-alpine AS base

WORKDIR /app

# ---- Dependencies Stage ----
FROM base AS deps

COPY package.json package-lock.json ./
# Install native build tools for better-sqlite3, then install deps (incl. dev)
RUN apk add --no-cache python3 make g++ \
 && npm install --include=dev

# ---- Builder Stage ----
FROM deps AS builder

COPY . .

# Ensure data dir exists so db file can be created at build (optional)
RUN mkdir -p /app/data /app/data/uploads

# Build Next (postbuild compiles custom server)
RUN npm run build \
 && rm -rf .next/cache \
 && npm cache clean --force

# ---- Runner Stage (Slim) ----
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy minimal Next runtime with its pruned node_modules
COPY --from=builder /app/.next/standalone ./

# Static assets required by Next
COPY --from=builder /app/.next/static ./.next/static

# Public assets
COPY --from=builder /app/public ./public

# Custom server compiled output and (optionally) pre-baked DB dir
COPY --from=builder /app/dist ./dist

# Ensure uploads dir exists (safe if already copied)
RUN mkdir -p /app/data /app/data/uploads

# Overlay Next compiled vendor modules (e.g., webpack) that are referenced at runtime
# but may be pruned in the minimal standalone bundle. This is much smaller than
# copying the whole next package while fixing the module-not-found error.
COPY --from=deps /app/node_modules/next/dist/compiled /app/node_modules/next/dist/compiled

EXPOSE 8087

# Database tables are created at runtime on first start using better-sqlite3.

CMD ["node", "dist/server.js"]
