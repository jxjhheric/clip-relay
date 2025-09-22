import { NextRequest, NextResponse } from 'next/server';
import { db, clipboardItems } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { CLIPBOARD_REORDERED_EVENT } from '@/lib/socket-events';
import { sseBroadcast } from '@/lib/sse';

// POST /api/clipboard/reorder
// body: { ids: string[] } — desired order, top-to-bottom
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 });
    }

    // Get current max sortWeight to append these to the top in given order
    const [{ max }] = await db
      .select({ max: sql<number>`COALESCE(MAX(${clipboardItems.sortWeight}), 0)` })
      .from(clipboardItems);

    await db.transaction(async (tx) => {
      // Highest weight for first item to keep them on top in given order
      const base = (max ?? 0) + ids.length;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const weight = base - i;
        await tx
          .update(clipboardItems)
          .set({ sortWeight: weight })
          .where(eq(clipboardItems.id, id));
      }
    });

    // Broadcast reorder to connected clients (they can re-sequence visible items)
    sseBroadcast(CLIPBOARD_REORDERED_EVENT, { ids });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to reorder:', e);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}

