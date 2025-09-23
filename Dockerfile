##############################
# Frontend build (Next export)
##############################
FROM node:20-bookworm-slim AS frontend
WORKDIR /app

# Install deps (prod only is fine for export)
COPY package.json package-lock.json ./
# Install all deps (including dev) for build-time tools like Tailwind/PostCSS
RUN npm ci

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

##############################
# Rust build
##############################
FROM rust:1-bookworm AS rust-builder
WORKDIR /app

# Cache deps first
COPY rust-server/Cargo.toml rust-server/Cargo.lock ./rust-server/
RUN mkdir -p rust-server/src && echo "fn main(){}" > rust-server/src/main.rs \
 && cargo build --manifest-path rust-server/Cargo.toml --release \
 && rm -rf rust-server/target/release/deps/clip_relay*

# Build with sources
COPY rust-server ./rust-server
RUN cargo build --manifest-path rust-server/Cargo.toml --release

##############################
# Runtime image (Debian slim)
##############################
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN useradd -u 10001 -r -s /sbin/nologin appuser \
 && mkdir -p /app/data/uploads \
 && chown -R appuser:appuser /app

# Copy static export
COPY --from=frontend /app/.next-export /app/.next-export

# Copy Rust server binary
COPY --from=rust-builder /app/rust-server/target/release/clip-relay /usr/local/bin/clip-relay

# Environment
ENV RUST_LOG=info \
    STATIC_DIR=/app/.next-export \
    PORT=8087

EXPOSE 8087
USER appuser

CMD ["/usr/local/bin/clip-relay"]
