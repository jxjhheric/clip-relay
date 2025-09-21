export function isSecure(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.isSecureContext;
  } catch {
    return false;
  }
}

export async function safeCopyText(text: string): Promise<boolean> {
  // In insecure contexts (HTTP), clipboard APIs are unreliable across browsers.
  // Return false so callers can fall back to manual copy UI.
  if (!isSecure()) {
    return false;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough to execCommand fallback
  }

  try {
    // Fallback: create a hidden textarea and use execCommand('copy')
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
