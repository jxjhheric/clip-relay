# Cloud Clipboard

A self-hosted cloud clipboard for quickly sharing text snippets, files, and images across devices. The app is built with Next.js and provides realtime updates, drag-and-drop uploads, and lightweight authentication suitable for personal or small-team use.

## Features
- Realtime clipboard synchronization via Socket.IO and Prisma
- Upload text, files, and pasted images with progress feedback
- Drag-and-drop reordering powered by `@dnd-kit`
- Full-text search across clipboard content and filenames
- Optional password gate stored in sessionStorage
- Responsive UI built from shadcn/ui components and Tailwind CSS 4

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
The server uses `nodemon` + `tsx` to reload `server.ts`. The Next.js dev build is served on [http://localhost:3000](http://localhost:3000).

### Production build
```bash
npm run build
npm start
```
`npm start` runs `prisma db push` before launching the custom server in production mode.

## Environment Variables
Create a `.env` file based on the included example:

```
DATABASE_URL="file:../db/custom.db"
CLIPBOARD_PASSWORD="change-me"
```
- `DATABASE_URL` points Prisma to the SQLite database file. Relative paths are resolved from `prisma/schema.prisma`, so `file:../db/custom.db` maps to `db/custom.db` in the project root (and `/app/db/custom.db` inside Docker).
- `CLIPBOARD_PASSWORD` controls access to the UI; users must enter the password once per session.

## Docker
A multi-stage Dockerfile is provided. To build locally:
```bash
docker build -t cloud-clipboard .
```
Consider trimming dependencies (`npm prune --omit=dev`) or using Next.js standalone output if you need a smaller image.

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
- The repo includes `db/.gitkeep` so the database directory exists without committing SQLite files. Real database files under `db/` or `prisma/db/` are ignored by git.
- Tailwind CSS 4 tooling is sensitive to version drift; if you regenerate the lockfile, pin `tailwindcss` and `@tailwindcss/postcss` to the tested versions (currently `4.1.12`).
- Uploaded files are stored base64-encoded in SQLite. For large deployments consider swapping to object storage or streaming uploads.

## License
This project began from a Z.ai scaffold and has since been adapted for the Cloud Clipboard use case. Update this section with your preferred license if you plan to distribute the code.






