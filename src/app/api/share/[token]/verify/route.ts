import { NextRequest, NextResponse } from 'next/server';
import { db, shareLinks } from '@/lib/db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const { password } = await request.json();
    if (!password) return NextResponse.json({ error: 'password required' }, { status: 400 });

    const [share] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    if (!share) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (share.revoked) return NextResponse.json({ error: 'revoked' }, { status: 404 });
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'expired' }, { status: 404 });
    }

    if (!share.passwordHash) {
      return NextResponse.json({ error: 'no password set' }, { status: 400 });
    }

    const h = crypto.createHash('sha256');
    h.update(password);
    h.update('|');
    h.update(token);
    const hashed = h.digest('hex');
    if (hashed !== share.passwordHash) {
      return NextResponse.json({ error: 'invalid password' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    const protoHeader = request.headers.get('x-forwarded-proto');
    const scheme = (protoHeader || request.nextUrl.protocol.replace(':','')).toLowerCase();
    const isSecure = scheme === 'https';
    res.cookies.set(`share_auth_${token}`, share.passwordHash, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: 'verify failed' }, { status: 500 });
  }
}
