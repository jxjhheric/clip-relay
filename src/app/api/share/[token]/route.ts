import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function validateShare(share: any) {
  if (!share || share.revoked) return { ok: false, reason: 'revoked' };
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (
    typeof share.maxDownloads === 'number' &&
    share.maxDownloads >= 0 &&
    share.downloadCount >= share.maxDownloads
  ) {
    return { ok: false, reason: 'exhausted' };
  }
  return { ok: true };
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
            fileName: true,
            fileSize: true,
            contentType: true,
            createdAt: true,
            updatedAt: true,
            // Do not include inlineData/content here
            content: true,
          },
        },
      },
    });

    const { ok, reason } = validateShare(share);
    if (!ok) {
      return NextResponse.json({ error: reason ?? 'invalid' }, { status: 404 });
    }

    const needsPassword = !!share?.passwordHash;
    let authorized = !needsPassword;
    if (needsPassword) {
      const c = request.cookies.get(`share_auth_${token}`)?.value;
      authorized = c === share?.passwordHash;
    }

    // Only expose content if TEXT and authorized; otherwise keep metadata minimal
    return NextResponse.json({
      token,
      item: {
        id: share!.item.id,
        type: share!.item.type,
        fileName: share!.item.fileName,
        fileSize: share!.item.fileSize,
        contentType: share!.item.contentType,
        content: authorized && share!.item.type === 'TEXT' ? share!.item.content : undefined,
        createdAt: share!.item.createdAt,
        updatedAt: share!.item.updatedAt,
      },
      expiresAt: share!.expiresAt,
      maxDownloads: share!.maxDownloads,
      downloadCount: share!.downloadCount,
      requiresPassword: needsPassword,
      authorized,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to get share' }, { status: 500 });
  }
}

// Protected: delete a share link record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const share = await db.shareLink.findUnique({ where: { token } });
    if (!share) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db.shareLink.delete({ where: { token } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'failed to delete' }, { status: 500 });
  }
}
