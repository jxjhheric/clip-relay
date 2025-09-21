import { NextRequest } from 'next/server';
import { db, clipboardItems } from '@/lib/db';
import { eq } from 'drizzle-orm';
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

    const [item] = await db
      .select({
        id: clipboardItems.id,
        filePath: clipboardItems.filePath,
        inlineData: clipboardItems.inlineData,
        fileName: clipboardItems.fileName,
        contentType: clipboardItems.contentType,
      })
      .from(clipboardItems)
      .where(eq(clipboardItems.id, id))
      .limit(1);

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
    // Add short caching to improve repeat preview performance for authenticated users
    // Keep it private to avoid shared caching on proxies.
    headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');

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
      const buf = item.inlineData as unknown as Buffer;
      headers.set('Content-Length', String(buf.byteLength));
      headers.set('Content-Type', contentType);
      return new NextResponse(buf, { headers });
    }

    return NextResponse.json({ error: 'File content missing' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
