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

RUN apk add --no-cache ca-certificates && update-ca-certificates

COPY --chown=0:0 --from=frontend /app/.next-export /app/.next-export
COPY --chown=0:0 --from=rust-builder /app/rust-server/target/release/clip-relay /usr/local/bin/clip-relay

RUN chmod a+rx /usr/local/bin/clip-relay \
 && mkdir -p /app/data /app/data/uploads /app/logs /app/tmp \
 && chgrp -R 0 /app/data /app/logs /app/tmp \
 && chmod -R 2775 /app/data /app/logs /app/tmp

ENV RUST_LOG=info \
    STATIC_DIR=/app/.next-export \
    PORT=8087 \
    HOME=/tmp

EXPOSE 8087

CMD ["/bin/sh","-c","umask 0002 && exec /usr/local/bin/clip-relay"]