import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.CLIPBOARD_PASSWORD;

    if (!correctPassword) {
      // 如果服务器没有设置密码，则认为任何密码都无效
      return NextResponse.json({ error: 'Authentication not configured on server' }, { status: 500 });
    }

    if (password === correctPassword) {
      const res = NextResponse.json({ success: true });
      // decide secure based on incoming scheme (supports reverse proxies)
      const protoHeader = request.headers.get('x-forwarded-proto');
      const scheme = (protoHeader || request.nextUrl.protocol.replace(':','')).toLowerCase();
      const isSecure = scheme === 'https';
      // Set a cookie so that browser requests (e.g., <img src>) carry auth automatically
      res.cookies.set('auth', password, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return res;
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
