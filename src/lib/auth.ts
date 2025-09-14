// 认证相关的工具函数

const PASSWORD_STORAGE_KEY = 'clipboard_password';

// 获取认证头
export function getAuthHeaders(): HeadersInit {
  const password = typeof window !== 'undefined' ? sessionStorage.getItem(PASSWORD_STORAGE_KEY) : null;
  if (!password) {
    return {};
  }
  return {
    'Authorization': `Bearer ${password}`,
  };
}


// 验证密码
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}

// 清理存储的密码
export function clearPassword() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  }
}

// 带认证的fetch函数
export async function authFetch(url: string, options: RequestInit = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  
  return fetch(url, {
    ...options,
    headers,
  });
}