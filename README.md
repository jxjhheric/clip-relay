# Clip Relay

[English](README.md) | [简体中文](README.zh-CN.md)

A self-hosted cloud clipboard for quickly sharing text snippets, files, and images across devices. The UI is a static Next.js export and the server is implemented in Rust (axum). It provides realtime updates, drag-and-drop uploads, and lightweight authentication suitable for personal or small-team use.

## Features
- Realtime clipboard synchronization via SSE (Server-Sent Events) and SQLite
- Upload text, files, and pasted images with progress feedback
- Drag-and-drop reordering powered by `@dnd-kit`
- Full-text search across clipboard content and filenames
- Lightweight password gate with 7-day cookie session (configurable); manual logout available in settings
- Responsive UI built from shadcn/ui components and Tailwind CSS 4

## Live Demo
- Visit: https://clip-frontend.808711.xyz

## Architecture Overview
- **Frontend**: Next.js App Router (React 19), exported statically (no SSR) with Tailwind CSS 4 and shadcn/ui (`src/app`, `src/components/ui`).
- **Server**: Rust (axum) in `rust-server/` serves the API and static assets; realtime events via SSE at `/api/events`.
- **Data**: SQLite via `rusqlite` (bundled), persisted under `data/` (uploads under `data/uploads/`).
- **Auth**: Minimal bearer password + cookie managed by the Rust server at `/api/auth/verify`.
- **Realtime**: SSE events broadcast create/delete/reorder.

## Getting Started
### Prerequisites
- Node.js 20+ (build the static frontend)
- npm 10+
- Rust toolchain (if running server locally without Docker)

### Install frontend dependencies
```bash
npm install
```

### Local run (Rust server + static UI)
```bash
# 1) Build static export to .next-export/
npm run build

# 2) Start Rust API server (serves static UI too)
npm run rust:dev
```
Then open http://localhost:8087 (or set `PORT`). For iterative UI development, you can run Next’s dev server separately and point the UI to the Rust API using `NEXT_PUBLIC_API_BASE`.

## Environment Variables
Create a `.env` file (minimum):

```
CLIPBOARD_PASSWORD="change-me"
# Optional: override defaults
# STATIC_DIR="/app/.next-export"   # where static UI is served from
# PORT=8087                         # server listen port
# AUTH_MAX_AGE_SECONDS=604800       # auth cookie max-age in seconds (default: 7 days)
```
- `CLIPBOARD_PASSWORD` controls access to the UI.
- `STATIC_DIR` is optional; by default the server tries `.next-export/`, `out/`, or `../.next-export`.
- `AUTH_MAX_AGE_SECONDS` controls cookie lifetime. Defaults to 7 days; tune longer/shorter as needed.
- The SQLite database lives under `./data/custom.db` (auto-created). Ensure the mounted volume is writable by the container user.

## Docker
The provided `Dockerfile` builds a slim Rust runtime image including the static Next export. First-time empty volumes are auto-initialized by the server.

### Build locally
```bash
docker build -t clip-relay:latest -f Dockerfile .
```

### Pull prebuilt images
```bash
# Replace with your registry/namespace used in CI
docker pull $REGISTRY/$NAMESPACE/clip-relay:latest

# Versioned (immutable) tags per commit SHA are also published:
docker pull $REGISTRY/$NAMESPACE/clip-relay:sha-$GITHUB_SHA
```

### Multi-arch images (ARM64 supported)
- CI publishes multi-platform images: `linux/amd64` and `linux/arm64`. On ARM hosts, a plain `docker pull` will fetch the right variant automatically.
- If you see `exec format error`, you likely pulled a single-arch image or one that doesn’t match your host.
- Inspect a tag’s manifest list:
  - `docker buildx imagetools inspect $REGISTRY/$NAMESPACE/clip-relay:<TAG>`
  - or `docker manifest inspect $REGISTRY/$NAMESPACE/clip-relay:<TAG>`
- To force a specific platform:
  - `docker pull --platform=linux/arm64 $REGISTRY/$NAMESPACE/clip-relay:<TAG>`

### Run with Docker Compose (recommended)
Create `.env` with at least:
```
CLIPBOARD_PASSWORD="change-me"
```

Compose example (map the data directory for persistence):
```
services:
  app:
    # For reproducible deploys, prefer the SHA tag:
    # image: $REGISTRY/$NAMESPACE/clip-relay:sha-$GITHUB_SHA
    # Or track latest for convenience:
    image: $REGISTRY/$NAMESPACE/clip-relay:latest
    ports:
      - "8087:8087"  # Rust server listens on 8087 by default
    env_file: .env
    volumes:
      - /srv/clip-relay/data:/app/data
    restart: unless-stopped
    pull_policy: always
```

Notes:
- The working directory is `/app`. The server writes SQLite DB to `/app/data/custom.db` and uploads to `/app/data/uploads`.
- The static UI is embedded at build time under `/app/.next-export`.

#### First-time init note
No manual step is needed. The app creates tables on first start when the SQLite file is empty.

## CI / Workflow

The GitHub Actions workflow is now manual to avoid building on every push. Trigger it from the Actions tab:

- Workflow name: "Build and Push Docker Image"
- Event: `workflow_dispatch` (Run workflow)
- Optionally publish versioned (immutable) tags per commit SHA.

## Project Structure
```
src/
├─ app/              # App Router pages, layout, global styles
├─ components/ui/    # Reusable shadcn/ui wrappers
├─ hooks/            # Custom hooks (toast, mobile detection)
└─ lib/              # Auth, SSE helpers, util functions
rust-server/         # Rust (axum) API server (serves static UI)
```

## License
MIT  - Please refer to [LICENSE](LICENSE)
