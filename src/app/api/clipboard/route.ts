import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getIO, CLIPBOARD_CREATED_EVENT } from '@/lib/socket';

// GET /api/clipboard - 获取所有剪贴板条目
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
    let items;
    if (search) {
      items = await db.clipboardItem.findMany({
        where: {
          OR: [
            {
              content: {
               contains: search
             }
           },
           {
             fileName: {
               contains: search
             }
           }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } else {
      items = await db.clipboardItem.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching clipboard items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clipboard items' },
      { status: 500 }
    );
  }
}

// POST /api/clipboard - 创建新的剪贴板条目
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const content = formData.get('content') as string;
    const type = formData.get('type') as 'TEXT' | 'IMAGE' | 'FILE';
    const file = formData.get('file') as File | null;

    let fileData: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileData = `data:${file.type};base64,${buffer.toString('base64')}`;
      fileName = file.name;
      fileSize = file.size;
    }

    if (!content && !file) {
      return NextResponse.json(
        { error: 'Content or file is required' },
        { status: 400 }
      );
    }

    const newItem = await db.clipboardItem.create({
      data: {
        type,
        content,
        fileName,
        fileSize,
        fileData,
      },
    });

    // WebSocket: 广播创建事件
    const io = getIO();
    io?.emit(CLIPBOARD_CREATED_EVENT, newItem);

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating clipboard item:', error);
    return NextResponse.json(
      { error: 'Failed to create clipboard item' },
      { status: 500 }
    );
  }
}