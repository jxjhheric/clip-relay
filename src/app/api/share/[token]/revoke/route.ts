import { NextRequest, NextResponse } from 'next/server';
import { db, shareLinks } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

// Protected by middleware (requires global password)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const [share] = await db.select({ token: shareLinks.token }).from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    if (!share) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    await db.update(shareLinks).set({ revoked: true, updatedAt: sql`(unixepoch())` }).where(eq(shareLinks.token, token));
    return NextResponse.json({ success: true, revoked: true });
  } catch (err) {
    return NextResponse.json({ error: 'failed to revoke' }, { status: 500 });
  }
}
