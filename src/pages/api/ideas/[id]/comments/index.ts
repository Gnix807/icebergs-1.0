import type { APIContext } from 'astro';
import { prisma } from '../../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../../lib/api';
import { getSession } from '../../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const { id } = event.params;
  if (!id) return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  try {
    const comments = await prisma.comment.findMany({
      where: { ideaId: id, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, content: true, createdAt: true,
        user: { select: { id: true, username: true, nickname: true, avatar: true } },
        guestName: true,
        _count: { select: { likes: true, replies: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, content: true, createdAt: true,
            user: { select: { id: true, username: true, nickname: true, avatar: true } },
            guestName: true,
            _count: { select: { likes: true } },
          },
        },
      },
    });

    return new Response(JSON.stringify(success({ comments })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取创意评论失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });

  try {
    let body: { content?: string };
    try { body = await event.request.json(); } catch {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const content = (body.content ?? '').trim();
    if (!content || content.length > 2000) return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '评论内容 1-2000 字')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });

    const comment = await prisma.comment.create({
      data: { ideaId: id, userId: session.userId, content },
      select: {
        id: true, content: true, createdAt: true,
        user: { select: { id: true, username: true, nickname: true, avatar: true } },
        _count: { select: { likes: true } },
      },
    });

    return new Response(JSON.stringify(success({ comment })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('发表创意评论失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '发表失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
