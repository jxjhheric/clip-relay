##############################
# Frontend build (Next export)
##############################
FROM node:20-alpine AS frontend
WORKDIR /app

# Install deps (prod only is fine for export)
COPY package.json package-lock.json ./
# Install build tools for native deps (e.g., sharp), then install deps
RUN apk add --no-cache python3 make g++ \
 && npm ci

# Copy sources needed for static export
COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./
COPY eslint.config.mjs ./
COPY components.json ./
COPY public ./public
COPY src ./src

# Produce static export to .next-export
ENV NODE_ENV=production
RUN npm run build && rm -rf .next && npm cache clean --force

# Precompress static assets (brotli only)
COPY scripts ./scripts
RUN node ./scripts/precompress.mjs /app/.next-export --write-br --no-gz

##############################
# Rust build
##############################
FROM rust:1-alpine AS rust-builder
WORKDIR /app

# Cache deps first
COPY rust-server/Cargo.toml rust-server/Cargo.lock ./rust-server/
RUN apk add --no-cache musl-dev build-base pkgconf \
 && mkdir -p rust-server/src && echo "fn main(){}" > rust-server/src/main.rs \
 && cargo build --manifest-path rust-server/Cargo.toml --release \
 && rm -rf rust-server/target/release/deps/clip_relay*

# Build with sources
COPY rust-server ./rust-server
RUN cargo build --manifest-path rust-server/Cargo.toml --release

##############################
# Runtime image (Alpine + Rust server only)
##############################
FROM alpine:3.20 AS runtime
WORKDIR /app

# Create non-root user first and install runtime deps
RUN addgroup -S app && adduser -S -G app -u 10001 appuser \
 && apk add --no-cache ca-certificates

# Copy artifacts
COPY --from=frontend /app/.next-export /app/.next-export
COPY --from=rust-builder /app/rust-server/target/release/clip-relay /usr/local/bin/clip-relay

# Ensure data dir exists and fix ownership/exec bits deterministically
RUN mkdir -p /app/data/uploads \
 && chown -R appuser:app /app \
 && chmod 0755 /usr/local/bin/clip-relay

# Environment
ENV RUST_LOG=info \
    STATIC_DIR=/app/.next-export \
    PORT=8087

EXPOSE 8087
USER appuser

CMD ["/usr/local/bin/clip-relay"]
