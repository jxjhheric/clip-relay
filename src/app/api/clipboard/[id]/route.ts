import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getIO } from '@/lib/socket';
import { CLIPBOARD_DELETED_EVENT } from '@/lib/socket-events';

// GET /api/clipboard/[id] - 获取单个剪贴板条目
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = await db.clipboardItem.findUnique({
      where: {
        id: params.id
      }
    });

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
  { params }: { params: { id: string } }
) {
  try {
    const item = await db.clipboardItem.findUnique({
      where: {
        id: params.id
      }
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Clipboard item not found' },
        { status: 404 }
      );
    }

    await db.clipboardItem.delete({
      where: {
        id: params.id
      }
    });

    // WebSocket: 广播删除事件
    const io = getIO();
    io?.emit(CLIPBOARD_DELETED_EVENT, { id: params.id });
    
    return NextResponse.json({ message: 'Clipboard item deleted successfully' });
  } catch (error) {
    console.error('Error deleting clipboard item:', error);
    return NextResponse.json(
      { error: 'Failed to delete clipboard item' },
      { status: 500 }
    );
  }
}