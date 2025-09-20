import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

    const item = await db.clipboardItem.findUnique({ where: { id: body.itemId } });
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

    const share = await db.shareLink.create({
      data: {
        token,
        itemId: item.id,
        expiresAt: expiresAt ?? undefined,
        maxDownloads: body.maxDownloads ?? undefined,
        passwordHash,
      },
    });

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

    // Build where filter
    const where: any = { ...(itemId ? { itemId } : {}) };
    if (!includeInvalid) {
      where.revoked = false;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ];
      where.AND = [
        {
          OR: [
            { maxDownloads: null },
            { maxDownloads: { gt: 0 }, downloadCount: { lt: { $ref: 'maxDownloads' } } },
          ],
        },
      ];
      // Note: Prisma 不支持在 where 中直接引用另一字段比较。
      // 因此这里改用在结果中过滤。见下方 postFilter。
    }

    const sharesRaw = await db.shareLink.findMany({
      where: includeInvalid ? where : (itemId ? { itemId, revoked: false } : { revoked: false }),
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize + 1, // for hasMore
      select: {
        token: true,
        itemId: true,
        expiresAt: true,
        maxDownloads: true,
        downloadCount: true,
        revoked: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
        item: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileSize: true,
            contentType: true,
          }
        },
      },
    });

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
      item: s.item,
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
