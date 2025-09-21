import { NextRequest, NextResponse } from 'next/server';
import { db, clipboardItems } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getIO } from '@/lib/socket';
import { CLIPBOARD_DELETED_EVENT } from '@/lib/socket-events';
import path from 'path';
import { promises as fs } from 'fs';

// GET /api/clipboard/[id] - 获取单个剪贴板条目
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [item] = await db
      .select({
        id: clipboardItems.id,
        type: clipboardItems.type,
        content: clipboardItems.content,
        fileName: clipboardItems.fileName,
        fileSize: clipboardItems.fileSize,
        contentType: clipboardItems.contentType,
        filePath: clipboardItems.filePath,
        createdAt: clipboardItems.createdAt,
        updatedAt: clipboardItems.updatedAt,
      })
      .from(clipboardItems)
      .where(eq(clipboardItems.id, id))
      .limit(1);

    if (!item) {
      return NextResponse.json(
        { error: 'Clipboard item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching clipboard item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clipboard item' },
      { status: 500 }
    );
  }
}

// DELETE /api/clipboard/[id] - 删除剪贴板条目
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [item] = await db
      .select({ id: clipboardItems.id, filePath: clipboardItems.filePath })
      .from(clipboardItems)
      .where(eq(clipboardItems.id, id))
      .limit(1);

    if (!item) {
      return NextResponse.json(
        { error: 'Clipboard item not found' },
        { status: 404 }
      );
    }

    await db.delete(clipboardItems).where(eq(clipboardItems.id, id));

    // Remove file from disk if exists
    if (item.filePath) {
      const absPath = path.join(process.cwd(), 'data', item.filePath);
      try {
        await fs.unlink(absPath);
      } catch (err) {
        // Ignore if already gone
      }
    }

    // WebSocket: 广播删除事件
    const io = getIO();
    io?.emit(CLIPBOARD_DELETED_EVENT, { id });
    
    return NextResponse.json({ message: 'Clipboard item deleted successfully' });
  } catch (error) {
    console.error('Error deleting clipboard item:', error);
    return NextResponse.json(
      { error: 'Failed to delete clipboard item' },
      { status: 500 }
    );
  }
}
