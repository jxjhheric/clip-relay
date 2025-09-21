import { NextRequest, NextResponse } from 'next/server';
import { registerSseClient, unregisterSseClient } from '@/lib/sse';

export async function GET(request: NextRequest) {
  // Create a stream and expose a writer for pushing events
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();
  const encoder = new TextEncoder();
  const clientId = crypto.randomUUID();

  const write = (chunk: string) => writer.write(encoder.encode(chunk));
  const close = () => { try { writer.close(); } catch {} };

  // Initial headers for SSE
  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');

  // Register client
  registerSseClient(clientId, write, close);

  // Send a hello + ping periodically to keep proxies happy
  const ping = () => write(`event: ping\n` + `data: {}\n\n`);
  write(`event: ready\n` + `data: {}\n\n`);
  const timer = setInterval(ping, 25_000);

  // Unregister on disconnect/abort
  const onAbort = () => {
    clearInterval(timer);
    unregisterSseClient(clientId);
  };
  request.signal.addEventListener('abort', onAbort);

  return new NextResponse(ts.readable, { headers });
}

