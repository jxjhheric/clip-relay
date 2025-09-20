import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getIO, CLIPBOARD_CREATED_EVENT } from '@/lib/socket';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

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
        select: {
          id: true,
          type: true,
          content: true,
          fileName: true,
          fileSize: true,
          createdAt: true,
          updatedAt: true,
          // 排除大字段 inlineData
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } else {
      items = await db.clipboardItem.findMany({
        select: {
          id: true,
          type: true,
          content: true,
          fileName: true,
          fileSize: true,
          createdAt: true,
          updatedAt: true,
        },
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
    
    // Mixed storage strategy
    const MAX_INLINE_BYTES = 256 * 1024; // 256KB threshold for inline storage
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let contentType: string | undefined;
    let inlineData: Buffer | undefined;
    let filePathRel: string | undefined;

    if (!content && !file) {
      return NextResponse.json(
        { error: 'Content or file is required' },
        { status: 400 }
      );
    }

    // Prepare file handling
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
      fileSize = file.size;
      contentType = file.type || undefined;

      if (buffer.byteLength <= MAX_INLINE_BYTES) {
        inlineData = buffer;
      } else {
        // Persist to filesystem under data/uploads
        const id = randomUUID();
        const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        const ext = path.extname(fileName || '') || '';
        const fileBaseName = `${id}${ext}`;
        const absPath = path.join(uploadsDir, fileBaseName);
        await fs.writeFile(absPath, buffer);
        filePathRel = path.join('uploads', fileBaseName).replace(/\\/g, '/');

        // Create with provided id to match file path
        const newItemFS = await db.clipboardItem.create({
          data: {
            id,
            type,
            content,
            fileName,
            fileSize,
            contentType,
            filePath: filePathRel,
          },
        });

        // WebSocket broadcast
        const io = getIO();
        const createdBroadcast = {
          id: newItemFS.id,
          type: newItemFS.type,
          content: newItemFS.content,
          fileName: newItemFS.fileName,
          fileSize: newItemFS.fileSize,
          createdAt: newItemFS.createdAt,
          updatedAt: newItemFS.updatedAt,
        };
        io?.emit(CLIPBOARD_CREATED_EVENT, createdBroadcast);

        return NextResponse.json(newItemFS, { status: 201 });
      }
    }

    // Inline or text-only create
    const newItem = await db.clipboardItem.create({
      data: {
        type,
        content,
        fileName,
        fileSize,
        contentType,
        inlineData,
        filePath: filePathRel,
      },
    });

    // WebSocket: 广播创建事件
    const io = getIO();
    const createdBroadcast = {
      id: newItem.id,
      type: newItem.type,
      content: newItem.content,
      fileName: newItem.fileName,
      fileSize: newItem.fileSize,
      createdAt: newItem.createdAt,
      updatedAt: newItem.updatedAt,
    };
    io?.emit(CLIPBOARD_CREATED_EVENT, createdBroadcast);

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating clipboard item:', error);
    return NextResponse.json(
      { error: 'Failed to create clipboard item' },
      { status: 500 }
    );
  }
}
