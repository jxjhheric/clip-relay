export function isSecure(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.isSecureContext;
  } catch {
    return false;
  }
}

export async function safeCopyText(text: string): Promise<boolean> {
  // Prefer legacy path first for broader compatibility (esp. on mobile/HTTP)
  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      // Place off-screen rather than invisible; some browsers ignore fully hidden elements for copy
      ta.style.position = 'fixed';
      ta.style.top = '-10000px';
      ta.style.left = '-10000px';
      ta.style.opacity = '1';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch {}

      // Hook copy event to set clipboardData explicitly (helps on some Android browsers)
      let copied = false;
      const onCopy = (e: ClipboardEvent) => {
        try {
          e.clipboardData?.setData('text/plain', text);
          e.preventDefault();
          copied = true;
        } catch {}
      };
      document.addEventListener('copy', onCopy, { capture: true, once: true } as any);
      const ok = document.execCommand('copy');
      document.removeEventListener('copy', onCopy, { capture: true } as any);
      document.body.removeChild(ta);
      if (ok || copied) return true;
    }
  } catch {}

  // Fallback to modern async API if available (usually requires HTTPS)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  return false;
}

export async function safeCopyBlob(blob: Blob, mime?: string): Promise<boolean> {
  if (!isSecure()) return false;
  try {
    const type = mime || (blob.type || 'application/octet-stream');
    // @ts-ignore ClipboardItem is available in modern browsers under secure contexts
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
      // @ts-ignore
      const item = new ClipboardItem({ [type]: blob });
      // @ts-ignore
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {}
  return false;
}
