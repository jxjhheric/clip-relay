import { Server } from 'socket.io';

export { CLIPBOARD_CREATED_EVENT, CLIPBOARD_DELETED_EVENT } from './socket-events';

const IO_KEY = '__clipboard_io__' as const;

/**
 * Register Socket.IO server instance on globalThis for cross-bundle access
 */
export function setIO(io: Server) {
  (globalThis as any)[IO_KEY] = io;
}

/**
 * Get the globally registered Socket.IO server instance
 */
export function getIO(): Server | null {
  return ((globalThis as any)[IO_KEY] as Server) ?? null;
}

export const setupSocket = (io: Server) => {
  // Avoid duplicate listeners in dev HMR / multiple invocations
  if ((io as any).__clipboard_initialized__) {
    return;
  }
  (io as any).__clipboard_initialized__ = true;

  // 握手鉴权：仅允许同源访问并且需要携带正确的 token（即密码）
  io.use((socket, next) => {
    const serverPassword = process.env.CLIPBOARD_PASSWORD;
    if (!serverPassword) {
      return next(new Error('Authentication not configured on server'));
    }

    // 校验同源：Origin 的 host 必须与 Host 头一致（浏览器同源连接会带 Origin）
    try {
      const origin = socket.handshake.headers.origin as string | undefined;
      const host = socket.handshake.headers.host as string | undefined;
      if (origin && host) {
        const url = new URL(origin);
        if (url.host !== host) {
          return next(new Error('CORS: cross-origin not allowed'));
        }
      }
    } catch {
      // 若 Origin 无法解析，继续走鉴权（大多数浏览器连接都会带 Origin）
    }

    const token = (socket.handshake.auth as any)?.token as string | undefined;
    if (!token || token !== serverPassword) {
      return next(new Error('Unauthorized'));
    }

    return next();
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // 简单回声（示例）
    socket.on('message', (msg: { text: string; senderId: string }) => {
      socket.emit('message', {
        text: `Echo: ${msg.text}`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
