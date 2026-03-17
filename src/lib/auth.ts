// 认证相关的工具函数

import { buildMobileConnectionBundle, type MobileConnectionBundle } from './mobile-connection';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

const PASSWORD_STORAGE_KEY = 'clipboard_password';
const ACCESS_TOKEN_STORAGE_KEY = 'clipboard_access_token';
const EMBEDDED_ACCESS_TOKEN_HASH_KEY = 'clipRelayAccessToken';

export function getStoredPassword(): string | null {
  return typeof window !== 'undefined' ? sessionStorage.getItem(PASSWORD_STORAGE_KEY) : null;
}

export function getStoredAccessToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
}

export function getStoredAuthCredential(): string | null {
  return getStoredAccessToken() || getStoredPassword();
}

export function getResolvedApiBase(): string {
  if (API_BASE) return API_BASE;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getMobileConnectionBundle(): MobileConnectionBundle | null {
  if (typeof window === 'undefined') return null;
  const accessToken = getStoredAccessToken();
  if (!accessToken) return null;
  return buildMobileConnectionBundle({
    serverUrl: window.location.origin,
    apiBase: getResolvedApiBase(),
    accessToken,
  });
}

export function storeAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

export function consumeEmbeddedAccessTokenFromLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return false;

  const params = new URLSearchParams(hash);
  const accessToken = params.get(EMBEDDED_ACCESS_TOKEN_HASH_KEY);
  if (!accessToken) return false;

  storeAccessToken(accessToken);
  params.delete(EMBEDDED_ACCESS_TOKEN_HASH_KEY);
  params.delete('clipRelayBootNonce');

  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
  return true;
}

// 获取认证头
export function getAuthHeaders(): HeadersInit {
  const credential = getStoredAuthCredential();
  if (!credential) {
    return {};
  }
  return {
    Authorization: `Bearer ${credential}`,
  };
}

// 验证密码
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json().catch(() => null)) as { accessToken?: string | null } | null;
    sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
    if (data?.accessToken) {
      storeAccessToken(data.accessToken);
    }
    return true;
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}

export async function refreshAccessToken(): Promise<string> {
  const response = await authFetch('/api/auth/access-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = (await response.json().catch(() => null)) as { accessToken?: string; error?: string } | null;
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.error || '无法生成设备凭证');
  }
  storeAccessToken(data.accessToken);
  return data.accessToken;
}

// 清理存储的密码
export function clearPassword() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  }
}

export function clearAccessToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

// 带认证的fetch函数
export async function authFetch(url: string, options: RequestInit = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  const creds: RequestCredentials | undefined = options.credentials || 'include';

  return fetch(fullUrl, {
    ...options,
    headers,
    credentials: creds,
  });
}

// 登出（清理本地存储，同时请求服务端清除 Cookie）
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  clearPassword();
  clearAccessToken();
}
