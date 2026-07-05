import type { APIContext } from 'astro';
import { prisma } from '../../lib/prisma';
import { success, error, ErrorCodes } from '../../lib/api';
import { getSession } from '../../lib/auth/index';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 获取关注用户列表
    const follows = await prisma.follow.findMany({
      where: { followerId: session.userId },
      select: { followingId: true },
    });
    const followingIds = follows.map(f => f.followingId);
    if (followingIds.length === 0) {
      return new Response(JSON.stringify(success({ items: [] })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 关注用户的最新冰山图
    const recentIcebergs = await prisma.iceberg.findMany({
      where: { authorId: { in: followingIds }, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, slug: true, title: true, createdAt: true,
        author: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });

    // 关注用户的最新评论
    const recentComments = await prisma.comment.findMany({
      where: { userId: { in: followingIds } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, content: true, createdAt: true,
        iceberg: { select: { id: true, slug: true, title: true } },
        user: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });

    const items = [
      ...recentIcebergs.map(i => ({ type: 'iceberg', ...i, content: i.title })),
      ...recentComments.map(c => ({ type: 'comment', ...c, content: c.content?.slice(0, 100) })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

    return new Response(JSON.stringify(success({ items })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取动态失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
