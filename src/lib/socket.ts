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

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle messages (demo)
    socket.on('message', (msg: { text: string; senderId: string }) => {
      // Echo only back to sender
      socket.emit('message', {
        text: `Echo: ${msg.text}`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // Send welcome message (demo)
    socket.emit('message', {
      text: 'Welcome to WebSocket Echo Server!',
      senderId: 'system',
      timestamp: new Date().toISOString(),
    });
  });
};