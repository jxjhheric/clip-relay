import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getIO, CLIPBOARD_CREATED_EVENT } from '@/lib/socket';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';

const pump = promisify(pipeline);

// GET /api/clipboard - 获取所有剪贴板条目
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const take = Math.min(48, Math.max(1, parseInt(searchParams.get('take') || '24', 10)));
    const cursorCreatedAt = searchParams.get('cursorCreatedAt');
    const cursorId = searchParams.get('cursorId');

    const andConds: any[] = [];
    if (search) {
      andConds.push({ OR: [ { content: { contains: search } }, { fileName: { contains: search } } ] });
    }
    if (cursorId && cursorCreatedAt) {
      const cursorDate = new Date(cursorCreatedAt);
      if (!isNaN(cursorDate.getTime())) {
        andConds.push({ OR: [ { createdAt: { lt: cursorDate } }, { AND: [ { createdAt: cursorDate }, { id: { lt: cursorId } } ] } ] });
      }
    }
    const where: any = andConds.length ? { AND: andConds } : {};

    const rows = await db.clipboardItem.findMany({
      where,
      select: {
        id: true,
        type: true,
        content: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? { id: rows[take].id, createdAt: rows[take].createdAt } : null;

    return NextResponse.json({ items, nextCursor, hasMore });
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
    const MAX_INLINE_BYTES = 256 * 1024;
    const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
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
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: 'File too large' },
          { status: 413 }
        );
      }
      fileName = file.name;
      fileSize = file.size;
      contentType = file.type || undefined;

      if (file.size <= MAX_INLINE_BYTES) {
        const buffer = Buffer.from(await file.arrayBuffer());
        inlineData = buffer;
      } else {
        const id = randomUUID();
        const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        const ext = path.extname(fileName || '') || '';
        const fileBaseName = `${id}${ext}`;
        const absPath = path.join(uploadsDir, fileBaseName);

        const webStream = file.stream();
        const nodeStream = Readable.fromWeb(webStream as any);
        await pump(nodeStream, createWriteStream(absPath));
        filePathRel = path.join('uploads', fileBaseName).replace(/\\/g, '/');

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
