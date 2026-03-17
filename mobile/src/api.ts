import type { MobileConnectionBundle } from './bundle';

export async function checkConnection(bundle: MobileConnectionBundle): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(joinUrl(bundle.apiBase, '/api/healthz'), {
      headers: {
        Authorization: `Bearer ${bundle.accessToken}`,
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      detail: text,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendText(bundle: MobileConnectionBundle, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Text is empty.');
  }

  const form = new FormData();
  form.set('type', 'TEXT');
  form.set('content', trimmed);
  await postClipboard(bundle, form);
}

export async function sendFiles(bundle: MobileConnectionBundle, files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  if (!list.length) {
    throw new Error('No files selected.');
  }

  for (const file of list) {
    const form = new FormData();
    form.set('type', file.type.startsWith('image/') ? 'IMAGE' : 'FILE');
    form.set('file', file, file.name);
    await postClipboard(bundle, form);
  }
}

async function postClipboard(bundle: MobileConnectionBundle, body: FormData): Promise<void> {
  const response = await fetch(joinUrl(bundle.apiBase, '/api/clipboard'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bundle.accessToken}`,
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Upload failed.');
    throw new Error(message || 'Upload failed.');
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}
