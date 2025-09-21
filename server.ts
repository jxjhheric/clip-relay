// server.ts - Next.js Standalone
import { createServer } from 'http';
import { promises as fsp } from 'fs';
import path from 'path';
// Load Next from standalone bundle path in production (slim image),
// and fall back to regular 'next' for local/dev environments.
function loadNext() {
  // Use a dynamic require to prevent bundlers from statically following this path
  const dynamicRequire: NodeRequire = (eval('require') as NodeRequire);
  const candidates = [
    // When dist/server.js lives under /app/dist and standalone under /app/.next
    '../.next/standalone/node_modules/next',
    // Fallback to regular resolution (dev/local)
    'next',
  ];
  for (const m of candidates) {
    try {
      const mod = dynamicRequire(m as any);
      return (mod && (mod as any).default) ? (mod as any).default : mod;
    } catch {
      // try next candidate
    }
  }
  throw new Error('Failed to load Next runtime');
}

const dev = process.env.NODE_ENV !== 'production';
const currentPort = Number(process.env.PORT) || 8087;
const hostname = '0.0.0.0';

// Custom server
async function createCustomServer() {
  try {
    // Create Next.js app
    const nextImpl = loadNext();
    const nextApp = nextImpl({
      dev,
      dir: process.cwd(),
      // In production, use the current directory where .next is located
      conf: dev ? undefined : { distDir: './.next' }
    });

    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    // Ensure data directories exist at runtime (especially when volumes are mounted)
    try {
      const dataDir = path.join(process.cwd(), 'data');
      const uploadsDir = path.join(dataDir, 'uploads');
      await fsp.mkdir(uploadsDir, { recursive: true });
    } catch (e) {
      console.warn('Warning: failed to ensure data/uploads directories:', e);
    }

    // Create HTTP server that delegates all requests to Next.js
    const server = createServer((req, res) => {
      handle(req, res);
    });

    // Start the server
    server.listen(currentPort, hostname, () => {
      console.log(`> Ready on http://${hostname}:${currentPort}`);
      console.log(`> Open http://localhost:${currentPort} in your browser`);
      console.log(`> SSE at http://localhost:${currentPort}/api/events`);
    });

  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
}

// Start the server
createCustomServer();
