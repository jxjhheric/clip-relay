# Cloud Clipboard

A self-hosted cloud clipboard for quickly sharing text snippets, files, and images across devices. The app is built with Next.js and provides realtime updates, drag-and-drop uploads, and lightweight authentication suitable for personal or small-team use.

## Features
- Realtime clipboard synchronization via Socket.IO and Prisma
- Upload text, files, and pasted images with progress feedback
- Drag-and-drop reordering powered by `@dnd-kit`
- Full-text search across clipboard content and filenames
- Optional password gate stored in sessionStorage
- Responsive UI built from shadcn/ui components and Tailwind CSS 4

[简体中文文档](README.zh-CN.md)

## Architecture Overview
- **Frontend**: Next.js App Router (React 19) with shadcn/ui component primitives and Tailwind CSS 4 for styling (`src/app`, `src/components/ui`)
- **Server**: Custom Node entry (`server.ts`) bootstraps Next.js and attaches a Socket.IO server for realtime events
- **Data**: SQLite managed through Prisma (`prisma/schema.prisma`, `src/lib/db.ts`)
- **Auth**: Minimal bearer password check handled in `src/app/api/auth/verify/route.ts`
- **Realtime**: Websocket events broadcast create/delete actions (`src/lib/socket.ts`, `src/lib/socket-events.ts`)

## Getting Started
### Prerequisites
- Node.js 20+
- npm 10+

### Install dependencies
```bash
npm ci
```
> Use `npm ci` to keep dependency versions aligned with `package-lock.json`. This avoids accidental upgrades that can break the Tailwind/PostCSS toolchain.

### Development
```bash
npm run dev
```
The server uses `nodemon` + `tsx` to reload `server.ts`. Open http://localhost:8087 in your browser (or set `PORT=xxxx`).

### Production build
```bash
npm run build
npm start
```
`npm start` runs `prisma db push` before launching the custom server in production mode. The server listens on `PORT` (default 8087).

## Environment Variables
Create a `.env` file based on the included example:

```
DATABASE_URL="file:../data/custom.db"
CLIPBOARD_PASSWORD="change-me"
```
- `DATABASE_URL` points Prisma to the SQLite database file. Relative paths are resolved from `prisma/schema.prisma`, so `file:../data/custom.db` maps to `data/custom.db` in the project root (and `/app/data/custom.db` inside Docker). If not set, the app falls back to `file:<project_root>/data/custom.db` automatically.
- `CLIPBOARD_PASSWORD` controls access to the UI; users must enter the password once per session.

## Docker

Two image variants are available:

- `:latest` (default) — built from `Dockerfile`. Easiest to use; on container start it runs `prisma db push` to initialize the SQLite schema automatically. Best for new users and new environments.
- `:slim` — built from `Dockerfile.slim`. Smaller and faster to pull. Does not run `db push` on start; first-time empty volume requires a one-time initialization.

### Build locally
```bash
# Regular image
docker build -t cloud-clipboard:latest -f Dockerfile .

# Slim image
docker build -t cloud-clipboard:slim -f Dockerfile.slim .
```

### Pull prebuilt images
```bash
# Replace with your registry/namespace used in CI
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:latest
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:slim

# Versioned (immutable) tags per commit SHA are also published:
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:sha-$GITHUB_SHA
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:slim-$GITHUB_SHA
```

### Run with Docker Compose (recommended)
Create `.env` with at least:
```
DATABASE_URL="file:../data/custom.db"
CLIPBOARD_PASSWORD="change-me"
```

Compose example (map the data directory for persistence):
```
services:
  app:
    # For reproducible deploys, prefer the SHA tag:
    # image: $REGISTRY/$NAMESPACE/cloud-clipboard:sha-$GITHUB_SHA
    # Or track latest for convenience:
    image: $REGISTRY/$NAMESPACE/cloud-clipboard:latest
    ports:
      - "8087:8087"
    env_file: .env
    volumes:
      - /srv/cloud-clipboard/data:/app/data
    restart: unless-stopped
    pull_policy: always
```

#### First-time init note for `:slim`
If you use the `:slim` image on a brand-new empty volume, initialize the DB schema once (choose one):

1) Use the `:latest` image to run a one-shot init, then switch back to `:slim`:
```bash
docker run --rm \
  -v /srv/cloud-clipboard/data:/app/data \
  --env-file /srv/cloud-clipboard/.env \
  $REGISTRY/$NAMESPACE/cloud-clipboard:latest \
  npx prisma db push --skip-generate
```

2) Temporarily start with `:latest` using your compose to create tables, stop it, then change the image tag to `:slim` and start again.

## CI / Workflow

The GitHub Actions workflow is now manual to avoid building on every push. Trigger it from the Actions tab:

- Workflow name: "Build and Push Docker Image"
- Event: `workflow_dispatch` (Run workflow)
- Optionally toggle whether to also build/push the `slim` image via the input parameter.

## Project Structure
```
src/
├─ app/              # App Router pages, API routes, layout, global styles
├─ components/ui/    # Reusable shadcn/ui wrappers
├─ hooks/            # Custom hooks (toast, mobile detection)
└─ lib/              # Auth, DB, socket helpers, util functions
prisma/              # Prisma schema and migrations
server.ts            # Custom Next.js + Socket.IO server entry point
```

## Maintenance Notes
- Some dependencies were inherited from the original scaffold. Periodically audit `package.json` to remove unused packages before building production images.
- The repo includes `data/.gitkeep` so the database directory exists without committing SQLite files. Real database files under `data/` or `prisma/db/` are ignored by git.
- Tailwind CSS 4 tooling is sensitive to version drift; if you regenerate the lockfile, pin `tailwindcss` and `@tailwindcss/postcss` to the tested versions (currently `4.1.12`).
- Mixed storage: small files/images are stored inline (SQLite BLOB), large files under `data/uploads/` and streamed via `/api/files/:id`.

## License
This project is a self-hosted Cloud Clipboard application.
