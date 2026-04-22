import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { notify } from '../../../../lib/notify';
import { awardCommentScore } from '../../../../lib/activityScore';


// GET /api/icebergs/[id]/comments?sort=time|hot
export async function GET(event: APIEvent) {
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

  const topLevel = await prisma.comment.findMany({
    where: { icebergId: iceberg.id, parentId: null },
    orderBy,
    select: {
      id: true, content: true, createdAt: true,
      user: { select: { id: true, username: true, nickname: true } },
      _count: { select: { likes: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, content: true, createdAt: true,
          user: { select: { id: true, username: true, nickname: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  // 收集所有评论 ID，批量查询当前用户的点赞状态
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
    likeCount: c._count.likes,
    isLikedByMe: likedSet.has(c.id),
    replies: c.replies.map((r: any) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      user: r.user,
      likeCount: r._count.likes,
      isLikedByMe: likedSet.has(r.id),
    })),
  }));

  return new Response(JSON.stringify(success({ comments })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/icebergs/[id]/comments
export async function POST(event: APIEvent) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'].includes(session.status)) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '当前账号无法发布评论')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = event.params.id!;
  const body = await event.request.json().catch(() => ({}));
  const content: string = typeof body.content === 'string' ? body.content.trim() : '';
  const parentId: string | null = typeof body.parentId === 'string' ? body.parentId : null;

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

  // 校验 parentId：必须存在、属于同一冰山、且本身是顶层（禁止多级嵌套）
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

  const comment = await prisma.comment.create({
    data: { icebergId: iceberg.id, userId: session.userId, content, parentId },
    select: {
      id: true, content: true, createdAt: true, parentId: true,
      user: { select: { id: true, username: true, nickname: true } },
    },
  });

  // 活跃质量分（fire-and-forget）
  awardCommentScore(session.userId);

  // 回复通知（不通知自己）
  if (parentAuthorId && parentAuthorId !== session.userId) {
    notify(
      parentAuthorId,
      'comment_reply',
      '有人回复了你的评论',
      content.slice(0, 80),
      `/iceberg/${iceberg.slug}`,
    );
  }

  return new Response(JSON.stringify(success({
    comment: { ...comment, likeCount: 0, isLikedByMe: false, replies: [] },
  })), { status: 201, headers: { 'Content-Type': 'application/json' } });
}
