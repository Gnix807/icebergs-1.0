import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { notifyAggregated } from '../../../../lib/notify';
import { awardCommentScore } from '../../../../lib/activityScore';

// 游客 IP 频率限制：每 IP 每小时最多 5 条
const guestLog = new Map<string, number[]>();
const GUEST_LIMIT = 5;
const GUEST_WINDOW = 60 * 60 * 1000;

function checkGuestRate(ip: string): boolean {
  const now = Date.now();
  const times = (guestLog.get(ip) ?? []).filter(t => now - t < GUEST_WINDOW);
  if (times.length >= GUEST_LIMIT) return false;
  guestLog.set(ip, [...times, now]);
  return true;
}

function getIp(event: APIContext): string {
  return (
    event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    event.request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// GET /api/icebergs/[id]/comments?sort=time|hot
export async function GET(event: APIContext) {
  const id = event.params.id!;
  const sort = (event.url.searchParams.get('sort') ?? 'time') as 'time' | 'hot';

  const session = await getSession(event);

  const iceberg = await prisma.iceberg.findFirst({
    where: { OR: [{ id }, { slug: id }], status: 'PUBLISHED' },
    select: { id: true },
  });
  if (!iceberg) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderBy = sort === 'hot'
    ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
    : [{ createdAt: 'asc' }];

  const topLevel = await (prisma.comment as any).findMany({
    where: { icebergId: iceberg.id, parentId: null },
    orderBy,
    select: {
      id: true, content: true, createdAt: true, guestName: true,
      user: { select: { id: true, username: true, nickname: true, avatar: true } },
      _count: { select: { likes: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, content: true, createdAt: true, guestName: true,
          user: { select: { id: true, username: true, nickname: true, avatar: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  const allIds: string[] = [];
  for (const c of topLevel) {
    allIds.push(c.id);
    for (const r of c.replies) allIds.push(r.id);
  }

  const likedSet = new Set<string>();
  if (session && allIds.length > 0) {
    const liked = await prisma.commentLike.findMany({
      where: { userId: session.userId, commentId: { in: allIds } },
      select: { commentId: true },
    });
    for (const l of liked) likedSet.add(l.commentId);
  }

  const comments = topLevel.map((c: any) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    user: c.user,
    guestName: c.guestName ?? null,
    likeCount: c._count.likes,
    isLikedByMe: likedSet.has(c.id),
    replies: c.replies.map((r: any) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      user: r.user,
      guestName: r.guestName ?? null,
      likeCount: r._count.likes,
      isLikedByMe: likedSet.has(r.id),
    })),
  }));

  return new Response(JSON.stringify(success({ comments })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/icebergs/[id]/comments
export async function POST(event: APIContext) {
  const session = await getSession(event);

  // 已登录用户：检查封禁状态
  if (session && ['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'].includes(session.status)) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '当前账号无法发布评论')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = event.params.id!;
  const body = await event.request.json().catch(() => ({}));
  const content: string = typeof body.content === 'string' ? body.content.trim() : '';
  const parentId: string | null = typeof body.parentId === 'string' ? body.parentId : null;

  // 游客：校验昵称 + 频率限制；不允许回复（只能发顶层评论）
  let guestName: string | null = null;
  if (!session) {
    const rawName: string = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    if (rawName.length < 2 || rawName.length > 20) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '游客昵称须为 2–20 个字符')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (parentId) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '游客暂不支持回复，请登录后参与')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!checkGuestRate(getIp(event))) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '评论太频繁，请稍后再试')), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }
    guestName = rawName;
  }

  if (!content) {
    return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '评论内容不能为空')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (content.length > 1000) {
    return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '评论不能超过 1000 字')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const iceberg = await prisma.iceberg.findFirst({
    where: { OR: [{ id }, { slug: id }], status: 'PUBLISHED' },
    select: { id: true, slug: true },
  });
  if (!iceberg) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 校验 parentId
  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, icebergId: true, parentId: true, userId: true },
    });
    if (!parent || parent.icebergId !== iceberg.id) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '被回复的评论不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (parent.parentId !== null) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '只支持一级回复')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    parentAuthorId = parent.userId;
  }

  const comment = await (prisma.comment as any).create({
    data: {
      icebergId: iceberg.id,
      userId: session?.userId ?? null,
      guestName,
      content,
      parentId,
    },
    select: {
      id: true, content: true, createdAt: true, parentId: true, guestName: true,
      user: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  });

  // 已登录用户：活跃质量分 + 回复通知
  if (session) {
    awardCommentScore(session.userId);
    if (parentAuthorId && parentAuthorId !== session.userId) {
      notifyAggregated(
        parentAuthorId,
        'comment_reply',
        `comment:${parentId}`,
        n => n === 1 ? '有人回复了你的评论' : `${n} 人回复了你的评论`,
        `/iceberg/${iceberg.slug}`,
      );
    }
  }

  return new Response(JSON.stringify(success({
    comment: { ...comment, likeCount: 0, isLikedByMe: false, replies: [] },
  })), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

