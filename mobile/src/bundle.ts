export type MobileConnectionBundle = {
  schemaVersion: 1;
  app: 'clip-relay';
  serverUrl: string;
  apiBase: string;
  accessToken: string;
  generatedAt: string;
};

const BUNDLE_STORAGE_KEY = 'clip-relay-mobile.bundle';

export function parseBundle(raw: string): MobileConnectionBundle | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MobileConnectionBundle>;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.app !== 'clip-relay' ||
      typeof parsed.serverUrl !== 'string' ||
      typeof parsed.apiBase !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.generatedAt !== 'string'
    ) {
      return null;
    }
    return parsed as MobileConnectionBundle;
  } catch {
    return null;
  }
}

export function loadBundle(): MobileConnectionBundle | null {
  const raw = window.localStorage.getItem(BUNDLE_STORAGE_KEY);
  return raw ? parseBundle(raw) : null;
}

export function saveBundle(bundle: MobileConnectionBundle) {
  window.localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
}

export function clearBundle() {
  window.localStorage.removeItem(BUNDLE_STORAGE_KEY);
}

export function maskToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}
