import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Protected by middleware (requires global password)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const share = await db.shareLink.findUnique({ where: { token } });
    if (!share) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const updated = await db.shareLink.update({ where: { token }, data: { revoked: true } });
    return NextResponse.json({ success: true, revoked: updated.revoked });
  } catch (err) {
    return NextResponse.json({ error: 'failed to revoke' }, { status: 500 });
  }
}

