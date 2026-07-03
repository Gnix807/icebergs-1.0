import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth/index';

export async function GET(event: APIContext) {
  const status = event.url.searchParams.get('status') || 'OPEN';
  const topic = event.url.searchParams.get('topic') || undefined;
  const take = Math.min(parseInt(event.url.searchParams.get('limit') || '20', 10), 50);
  const cursor = event.url.searchParams.get('cursor') || undefined;

  try {
    const where: any = { status };
    if (topic) where.topic = topic;

    const ideas = await prisma.idea.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        description: true,
        topic: true,
        status: true,
        claimedBy: true,
        icebergId: true,
        createdAt: true,
        _count: { select: { votes: true } },
        creator: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });

    const hasMore = ideas.length > take;
    if (hasMore) ideas.pop();
    const nextCursor = hasMore ? ideas[ideas.length - 1]?.id : null;

    return new Response(JSON.stringify(success({ ideas, cursor: nextCursor })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取创意列表失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { title?: string; description?: string; topic?: string };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const title = (body.title || '').trim();
  if (!title || title.length < 5 || title.length > 200) {
    return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '标题需 5-200 字')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const idea = await prisma.idea.create({
      data: {
        title,
        description: (body.description || '').trim() || null,
        topic: body.topic || 'general',
        creatorId: session.userId,
      },
      select: {
        id: true, title: true, description: true, topic: true,
        status: true, createdAt: true,
        _count: { select: { votes: true } },
        creator: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });

    return new Response(JSON.stringify(success({ idea })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建创意失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '创建失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
