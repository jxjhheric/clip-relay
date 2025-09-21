import { NextRequest, NextResponse } from 'next/server';
import { db, shareLinks, clipboardItems } from '@/lib/db';
import { eq } from 'drizzle-orm';

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
    const [row] = await db
      .select({
        token: shareLinks.token,
        expiresAt: shareLinks.expiresAt,
        maxDownloads: shareLinks.maxDownloads,
        downloadCount: shareLinks.downloadCount,
        revoked: shareLinks.revoked,
        passwordHash: shareLinks.passwordHash,
        itemId: clipboardItems.id,
        itemType: clipboardItems.type,
        itemFileName: clipboardItems.fileName,
        itemFileSize: clipboardItems.fileSize,
        itemContentType: clipboardItems.contentType,
        itemCreatedAt: clipboardItems.createdAt,
        itemUpdatedAt: clipboardItems.updatedAt,
        itemContent: clipboardItems.content,
      })
      .from(shareLinks)
      .leftJoin(clipboardItems, eq(shareLinks.itemId, clipboardItems.id))
      .where(eq(shareLinks.token, token))
      .limit(1);

    const { ok, reason } = validateShare(row);
    if (!ok) {
      return NextResponse.json({ error: reason ?? 'invalid' }, { status: 404 });
    }

    const needsPassword = !!row?.passwordHash;
    let authorized = !needsPassword;
    if (needsPassword) {
      const c = request.cookies.get(`share_auth_${token}`)?.value;
      authorized = c === row?.passwordHash;
    }

    // Only expose content if TEXT and authorized; otherwise keep metadata minimal
    return NextResponse.json({
      token,
      item: {
        id: row!.itemId,
        type: row!.itemType,
        fileName: row!.itemFileName,
        fileSize: row!.itemFileSize,
        contentType: row!.itemContentType,
        content: authorized && row!.itemType === 'TEXT' ? row!.itemContent : undefined,
        createdAt: row!.itemCreatedAt,
        updatedAt: row!.itemUpdatedAt,
      },
      expiresAt: row!.expiresAt,
      maxDownloads: row!.maxDownloads,
      downloadCount: row!.downloadCount,
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
    const [share] = await db.select({ token: shareLinks.token }).from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    if (!share) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db.delete(shareLinks).where(eq(shareLinks.token, token));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'failed to delete' }, { status: 500 });
  }
}
