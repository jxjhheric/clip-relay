import { NextRequest, NextResponse } from 'next/server';
import { db, shareLinks, clipboardItems } from '@/lib/db';
import path from 'path';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import { eq, sql } from 'drizzle-orm';

function isValid(share: any) {
  if (!share || share.revoked) return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return false;
  if (
    typeof share.maxDownloads === 'number' &&
    share.maxDownloads >= 0 &&
    share.downloadCount >= share.maxDownloads
  ) return false;
  return true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const [share] = await db
      .select({
        token: shareLinks.token,
        expiresAt: shareLinks.expiresAt,
        maxDownloads: shareLinks.maxDownloads,
        downloadCount: shareLinks.downloadCount,
        revoked: shareLinks.revoked,
        passwordHash: shareLinks.passwordHash,
        itemId: clipboardItems.id,
        type: clipboardItems.type,
        content: clipboardItems.content,
        fileName: clipboardItems.fileName,
        fileSize: clipboardItems.fileSize,
        contentType: clipboardItems.contentType,
        filePath: clipboardItems.filePath,
        inlineData: clipboardItems.inlineData,
      })
      .from(shareLinks)
      .leftJoin(clipboardItems, eq(shareLinks.itemId, clipboardItems.id))
      .where(eq(shareLinks.token, token))
      .limit(1);

    if (!isValid(share)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Password check
    if (share?.passwordHash) {
      const c = request.cookies.get(`share_auth_${token}`)?.value;
      if (c !== share.passwordHash) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

    // Increment download counter (best-effort)
    try {
      await db
        .update(shareLinks)
        .set({ downloadCount: sql`${shareLinks.downloadCount} + 1`, updatedAt: sql`(unixepoch())` })
        .where(eq(shareLinks.token, token));
    } catch {}

    const filename = share!.fileName || 'download';

    if (share!.type === 'TEXT') {
      const text = share!.content ?? '';
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename + '.txt')}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');
    const contentType = share!.contentType || 'application/octet-stream';
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    if (share!.filePath) {
      const absPath = path.join(process.cwd(), 'data', share!.filePath);
      try {
        const stat = await fs.stat(absPath);
        headers.set('Content-Length', String(stat.size));
      } catch {}
      const nodeStream = createReadStream(absPath);
      const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new NextResponse(stream, { headers });
    }

    if (share!.inlineData) {
      const buf = share!.inlineData as unknown as Buffer;
      headers.set('Content-Length', String(buf.byteLength));
      return new NextResponse(new Uint8Array(buf), { headers });
    }

    return NextResponse.json({ error: 'missing content' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
