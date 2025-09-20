import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import path from 'path';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { Readable } from 'stream';

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
    const share = await db.shareLink.findUnique({
      where: { token },
      select: {
        token: true,
        expiresAt: true,
        maxDownloads: true,
        downloadCount: true,
        revoked: true,
        passwordHash: true,
        item: {
          select: {
            id: true,
            type: true,
            content: true,
            fileName: true,
            fileSize: true,
            contentType: true,
            filePath: true,
            inlineData: true,
          }
        }
      }
    });

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

    // TEXT preview: inline as text/plain
    const filename = share!.item.fileName || 'download';
    const contentType = share!.item.contentType || 'application/octet-stream';
    if (share!.item.type === 'TEXT') {
      const text = share!.item.content ?? '';
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename + '.txt')}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const headers = new Headers();
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);

    if (share!.item.filePath) {
      const absPath = path.join(process.cwd(), 'data', share!.item.filePath);
      try {
        const stat = await fs.stat(absPath);
        headers.set('Content-Length', String(stat.size));
      } catch {}
      const nodeStream = createReadStream(absPath);
      const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new NextResponse(stream, { headers });
    }

    if (share!.item.inlineData) {
      const bytes = share!.item.inlineData as unknown as Uint8Array;
      const ab = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      headers.set('Content-Length', String(bytes.byteLength));
      return new NextResponse(ab, { headers });
    }

    return NextResponse.json({ error: 'missing content' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

