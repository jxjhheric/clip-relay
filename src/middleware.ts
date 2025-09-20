import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 放行密码校验端点，用于前端提交密码进行验证
  if (pathname === '/api/auth/verify') {
    return NextResponse.next();
  }

  // Public share routes: allow unauthenticated access to read-only endpoints
  if (pathname.startsWith('/api/share/')) {
    const method = request.method.toUpperCase();
    // allow GET /api/share/[token]
    // allow POST /api/share/[token]/verify
    // allow GET /api/share/[token]/file
    // allow GET /api/share/[token]/download
    const parts = pathname.split('/').filter(Boolean); // ['api','share',token,'...']
    if (parts.length >= 3) {
      const tail = parts.slice(3).join('/');
      const last = parts[3] ?? '';
      if (
        (parts.length === 3 && method === 'GET') ||
        (last === 'verify' && method === 'POST') ||
        (last === 'file' && method === 'GET') ||
        (last === 'download' && method === 'GET')
      ) {
        return NextResponse.next();
      }
    }
  }

  // 仅对其他 API 路由进行认证
  if (pathname.startsWith('/api/')) {
    const authPassword = process.env.CLIPBOARD_PASSWORD;

    // 未配置服务器密码则直接报错，避免“关闭密码”的变相逻辑
    if (!authPassword) {
      return NextResponse.json(
        { error: 'Authentication not configured on server' },
        { status: 500 }
      );
    }

    // 从请求头获取认证信息
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth')?.value;

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (cookieToken) {
      token = cookieToken;
    }

    if (!token || token !== authPassword) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
