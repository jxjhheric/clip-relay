##############################
# Frontend build (Next export)
##############################
FROM node:20-alpine AS frontend
WORKDIR /app

COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
 && npm ci

COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./
COPY eslint.config.mjs ./
COPY components.json ./
COPY public ./public
COPY src ./src

ENV NODE_ENV=production
RUN npm run build && rm -rf .next && npm cache clean --force

COPY scripts ./scripts
RUN node ./scripts/precompress.mjs /app/.next-export --write-br --no-gz

##############################
# Rust build
##############################
FROM rust:1-alpine AS rust-builder
WORKDIR /app

# Install build dependencies (perl for ring crate, used by rustls)
RUN apk add --no-cache musl-dev build-base perl

# Copy root files
COPY rust-server ./rust-server

# We remove Cargo.lock to ensure a fresh, consistent build inside the container
RUN rm -f rust-server/Cargo.lock

# Build the real application
RUN cargo build --manifest-path rust-server/Cargo.toml --release

##############################
# Runtime image (Alpine + Rust server only)
##############################
FROM alpine:3.20 AS runtime
WORKDIR /app

# Install ca-certificates and litestream
RUN apk add --no-cache ca-certificates && update-ca-certificates
ADD https://github.com/benbjohnson/litestream/releases/download/v0.5.8/litestream-0.5.8-linux-x86_64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz \
 && rm /tmp/litestream.tar.gz

COPY --chown=0:0 --from=frontend /app/.next-export /app/.next-export
COPY --chown=0:0 --from=rust-builder /app/rust-server/target/release/clip-relay /usr/local/bin/clip-relay

# Copy litestream config
COPY litestream.yml /etc/litestream.yml

RUN chmod a+rx /usr/local/bin/clip-relay /usr/local/bin/litestream \
 && mkdir -p /app/data /app/data/uploads /app/logs /app/tmp \
 && chgrp -R 0 /app/data /app/logs /app/tmp \
 && chmod -R 0777 /app/data /app/logs \
 && chmod 1777 /app/tmp

ENV RUST_LOG=info \
    STATIC_DIR=/app/.next-export \
    DATA_DIR=/app/data \
    PORT=8087 \
    HOME=/tmp

VOLUME ["/app/data"]

EXPOSE 8087

# Use litestream to replicate and run the application
# It will automatically restore if the database is missing and then keep it in sync
CMD ["/bin/sh","-c","umask 0002 && exec litestream replicate -exec /usr/local/bin/clip-relay"]
