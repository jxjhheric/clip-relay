const SSE_KEY = '__clipboard_sse__' as const;

type Client = {
  id: string;
  // May return a Promise (WritableStream writer.write returns a Promise)
  write: (chunk: string) => void | Promise<void>;
  close: () => void;
};

type SSEHub = {
  clients: Map<string, Client>;
  broadcast: (event: string, data: any) => void;
  add: (client: Client) => void;
  remove: (id: string) => void;
};

function getHub(): SSEHub {
  const g = globalThis as any;
  if (!g[SSE_KEY]) {
    const hub: SSEHub = {
      clients: new Map(),
      broadcast(event, data) {
        const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
        for (const [id, c] of hub.clients.entries()) {
          try {
            const res = c.write(payload) as any;
            if (res && typeof res.catch === 'function') {
              // If the stream is already closed, remove the client on rejection
              res.catch(() => {
                try { c.close(); } catch {}
                hub.clients.delete(id);
              });
            }
          } catch {
            try { c.close(); } catch {}
            hub.clients.delete(id);
          }
        }
      },
      add(client) {
        hub.clients.set(client.id, client);
      },
      remove(id) {
        const c = hub.clients.get(id);
        try { c?.close(); } catch {}
        hub.clients.delete(id);
      },
    };
    g[SSE_KEY] = hub;
  }
  return g[SSE_KEY] as SSEHub;
}

export function sseBroadcast(event: string, data: any) {
  getHub().broadcast(event, data);
}

export function registerSseClient(id: string, write: (chunk: string) => void, close: () => void) {
  getHub().add({ id, write, close });
}

export function unregisterSseClient(id: string) {
  getHub().remove(id);
}
