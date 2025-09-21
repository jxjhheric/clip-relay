import { NextRequest, NextResponse } from 'next/server';
import { db, clipboardItems, shareLinks } from '@/lib/db';
import { eq, desc, and } from 'drizzle-orm';
import crypto from 'crypto';

type CreateShareBody = {
  itemId: string;
  // One of expiresIn (seconds) or explicit expiresAt ISO
  expiresIn?: number;
  expiresAt?: string;
  maxDownloads?: number;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateShareBody;
    if (!body?.itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const [item] = await db
      .select({ id: clipboardItems.id })
      .from(clipboardItems)
      .where(eq(clipboardItems.id, body.itemId))
      .limit(1);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Compute expiry
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (!isNaN(d.getTime())) expiresAt = d;
    } else if (typeof body.expiresIn === 'number' && body.expiresIn > 0) {
      expiresAt = new Date(Date.now() + body.expiresIn * 1000);
    }

    // Generate token (URL-safe)
    const token = crypto.randomBytes(18).toString('base64url');

    // Optional weak hash for password. For self-host only; consider bcrypt later.
    let passwordHash: string | undefined;
    if (body.password && body.password.trim()) {
      const h = crypto.createHash('sha256');
      h.update(body.password);
      h.update('|');
      h.update(token); // salt with token
      passwordHash = h.digest('hex');
    }

    await db.insert(shareLinks).values({
      token,
      itemId: item.id,
      expiresAt: expiresAt ?? undefined,
      maxDownloads: body.maxDownloads ?? undefined,
      passwordHash,
    });
    const [share] = await db
      .select({
        token: shareLinks.token,
        expiresAt: shareLinks.expiresAt,
        maxDownloads: shareLinks.maxDownloads,
        passwordHash: shareLinks.passwordHash,
      })
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);

    return NextResponse.json({
      token: share.token,
      url: `/s/${share.token}`,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      requiresPassword: !!passwordHash,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId') ?? undefined;
    const includeRevoked = ['1','true','yes'].includes((searchParams.get('includeRevoked')||'').toLowerCase());
    const includeInvalid = includeRevoked || ['1','true','yes'].includes((searchParams.get('includeInvalid')||'').toLowerCase());
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const skip = (page - 1) * pageSize;

    const now = new Date();

    // Build base where and rely on postFilter for expired/exhausted logic
    const baseWhere: any = { ...(itemId ? { itemId } : {}) };
    const prismaWhere = includeInvalid ? baseWhere : { ...baseWhere, revoked: false };

    let whereExpr: any = undefined;
    const byItem = !!prismaWhere.itemId;
    const byRevoked = Object.prototype.hasOwnProperty.call(prismaWhere, 'revoked') && prismaWhere.revoked === false;
    if (byItem && byRevoked) {
      whereExpr = and(eq(shareLinks.itemId, prismaWhere.itemId!), eq(shareLinks.revoked, false));
    } else if (byItem) {
      whereExpr = eq(shareLinks.itemId, prismaWhere.itemId!);
    } else if (byRevoked) {
      whereExpr = eq(shareLinks.revoked, false);
    }

    // Fetch page of shares with joined minimal item fields
    const sharesRaw = await db
      .select({
        token: shareLinks.token,
        itemId: shareLinks.itemId,
        expiresAt: shareLinks.expiresAt,
        maxDownloads: shareLinks.maxDownloads,
        downloadCount: shareLinks.downloadCount,
        revoked: shareLinks.revoked,
        passwordHash: shareLinks.passwordHash,
        createdAt: shareLinks.createdAt,
        updatedAt: shareLinks.updatedAt,
        itemIdJoin: clipboardItems.id,
        itemType: clipboardItems.type,
        itemFileName: clipboardItems.fileName,
        itemFileSize: clipboardItems.fileSize,
        itemContentType: clipboardItems.contentType,
      })
      .from(shareLinks)
      .leftJoin(clipboardItems, eq(shareLinks.itemId, clipboardItems.id))
      .where(whereExpr as any)
      .orderBy(desc(shareLinks.createdAt))
      .limit(pageSize + 1)
      .offset(skip);

    const postFilter = (s: any) => {
      if (includeInvalid) return true;
      const expired = s.expiresAt && new Date(s.expiresAt).getTime() < now.getTime();
      const exhausted = typeof s.maxDownloads === 'number' && s.maxDownloads >= 0 && s.downloadCount >= s.maxDownloads;
      return !s.revoked && !expired && !exhausted;
    };

    const filtered = sharesRaw.filter(postFilter);
    const hasMore = filtered.length > pageSize;
    const pageItems = (hasMore ? filtered.slice(0, pageSize) : filtered).map((s) => ({
      token: s.token,
      url: `/s/${s.token}`,
      item: {
        id: s.itemIdJoin,
        type: s.itemType,
        fileName: s.itemFileName,
        fileSize: s.itemFileSize,
        contentType: s.itemContentType,
      },
      itemId: s.itemId,
      expiresAt: s.expiresAt,
      maxDownloads: s.maxDownloads,
      downloadCount: s.downloadCount,
      revoked: s.revoked,
      requiresPassword: !!s.passwordHash,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json({ data: pageItems, page, pageSize, hasMore });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to list shares' }, { status: 500 });
  }
}
