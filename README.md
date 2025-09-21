# Cloud Clipboard

[English](README.md) | [简体中文](README.zh-CN.md)

A self-hosted cloud clipboard for quickly sharing text snippets, files, and images across devices. The app is built with Next.js and provides realtime updates, drag-and-drop uploads, and lightweight authentication suitable for personal or small-team use.

## Features
- Realtime clipboard synchronization via SSE (Server-Sent Events) and SQLite
- Upload text, files, and pasted images with progress feedback
- Drag-and-drop reordering powered by `@dnd-kit`
- Full-text search across clipboard content and filenames
- Optional password gate stored in sessionStorage
- Responsive UI built from shadcn/ui components and Tailwind CSS 4

[**Screenshots**]
- Home: ![Home](public/screenshots/home.png)
- Detail dialog: ![Detail](public/screenshots/detail.png)

## Architecture Overview
- **Frontend**: Next.js App Router (React 19) with shadcn/ui component primitives and Tailwind CSS 4 for styling (`src/app`, `src/components/ui`)
- **Server**: Custom Node entry (`server.ts`) bootstraps Next.js; realtime events via SSE at `/api/events`
- **Data**: SQLite via better-sqlite3 + drizzle-orm (`src/lib/db.ts`, `src/lib/db/schema.ts`)
- **Auth**: Minimal bearer password check handled in `src/app/api/auth/verify/route.ts`
- **Realtime**: SSE events broadcast create/delete actions (`src/app/api/events/route.ts`, `src/lib/socket-events.ts`)

## Getting Started
### Prerequisites
- Node.js 20+
- npm 10+

### Install dependencies
```bash
npm install
```
> Use `npm install` to sync dependencies. If you pin lockfiles in CI, prefer a clean `npm ci` run after updating the lockfile.

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
`npm start` launches the custom server in production mode. Tables are created automatically on first start if the SQLite file is empty. The server listens on `PORT` (default 8087).

## Environment Variables
Create a `.env` file based on the included example:

```
DATABASE_URL="file:../data/custom.db"
CLIPBOARD_PASSWORD="change-me"
```
- `DATABASE_URL` points to the SQLite database file. Supports `file:relative/or/absolute/path.db` or a plain file path. If not set, the app falls back to `./data/custom.db` automatically.
- `CLIPBOARD_PASSWORD` controls access to the UI; users must enter the password once per session.

## Docker
The provided `Dockerfile` builds a slim, production-ready image. First-time empty volumes are auto-initialized at runtime.

### Build locally
```bash
docker build -t cloud-clipboard:latest -f Dockerfile .
```

### Pull prebuilt images
```bash
# Replace with your registry/namespace used in CI
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:latest

# Versioned (immutable) tags per commit SHA are also published:
docker pull $REGISTRY/$NAMESPACE/cloud-clipboard:sha-$GITHUB_SHA
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
├─ app/              # App Router pages, API routes, layout, global styles
├─ components/ui/    # Reusable shadcn/ui wrappers
├─ hooks/            # Custom hooks (toast, mobile detection)
└─ lib/              # Auth, DB, SSE helpers, util functions
src/lib/db/schema.ts # Drizzle ORM schema (SQLite)
server.ts            # Custom Next.js server entry point (SSE realtime)
```

## License
MIT  - Please refer to [LICENSE](LICENSE)
