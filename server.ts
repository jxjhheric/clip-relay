// server.ts - Next.js Standalone + Socket.IO
import { setupSocket, setIO, getIO } from './src/lib/socket';
import { createServer } from 'http';
import { Server } from 'socket.io';
// Load Next from standalone bundle path in production (slim image),
// and fall back to regular 'next' for local/dev environments.
function loadNext() {
  try {
    // Prefer Next bundled inside standalone output
    // Available at runtime in slim image
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./.next/standalone/node_modules/next');
    return (mod && mod.default) ? mod.default : mod;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('next');
    return (mod && mod.default) ? mod.default : mod;
  }
}

const dev = process.env.NODE_ENV !== 'production';
const currentPort = Number(process.env.PORT) || 8087;
const hostname = '0.0.0.0';

// Custom server with Socket.IO integration
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

    // Create HTTP server that will handle both Next.js and Socket.IO
    const server = createServer((req, res) => {
      // Skip socket.io requests from Next.js handler
      if (req.url?.startsWith('/api/socketio')) {
        return;
      }
      handle(req, res);
    });

    // Setup or reuse Socket.IO
    let io = getIO();
    if (!io) {
      io = new Server(server, {
        path: '/api/socketio',
        // 不配置 CORS，默认仅同源可用；跨域将被浏览器拦截
      });
      // make io accessible in API routes
      setIO(io);
      setupSocket(io);
    }

    // Start the server
    server.listen(currentPort, hostname, () => {
      console.log(`> Ready on http://${hostname}:${currentPort}`);
      console.log(`> Open http://localhost:${currentPort} in your browser`);
      console.log(`> Socket.IO at ws://localhost:${currentPort}/api/socketio`);
    });

  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
}

// Start the server
createCustomServer();
