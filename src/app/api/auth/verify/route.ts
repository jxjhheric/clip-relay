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
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}