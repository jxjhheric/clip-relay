import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import path from 'path';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { Readable } from 'stream';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const wantDownload = ['1', 'true', 'yes'].includes(
      (searchParams.get('download') || '').toLowerCase()
    );

    const item = await db.clipboardItem.findUnique({
      where: { id },
      select: {
        id: true,
        filePath: true,
        inlineData: true,
        fileName: true,
        contentType: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const headers = new Headers();
    const filename = item.fileName || 'download';
    const contentType = item.contentType || 'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set(
      'Content-Disposition',
      `${wantDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    if (item.filePath) {
      const absPath = path.join(process.cwd(), 'data', item.filePath);
      try {
        const stat = await fs.stat(absPath);
        headers.set('Content-Length', String(stat.size));
      } catch {}
      const nodeStream = createReadStream(absPath);
      const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new NextResponse(stream, { headers });
    }

    if (item.inlineData) {
      const bytes = item.inlineData as unknown as Uint8Array;
      const ab = (bytes.buffer as ArrayBuffer).slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
      headers.set('Content-Length', String(bytes.byteLength));
      headers.set('Content-Type', contentType);
      return new NextResponse(ab, { headers });
    }

    return NextResponse.json({ error: 'File content missing' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
