import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 放行密码校验端点，用于前端提交密码进行验证
  if (pathname === '/api/auth/verify') {
    return NextResponse.next();
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

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    if (token !== authPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};