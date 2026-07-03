import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = event.params;
  if (!id || id === session.userId) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '无效用户')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '用户不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: session.userId, followingId: id } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      const count = await prisma.follow.count({ where: { followingId: id } });
      return new Response(JSON.stringify(success({ following: false, followerCount: count })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.follow.create({ data: { followerId: session.userId, followingId: id } });
    const count = await prisma.follow.count({ where: { followingId: id } });
    return new Response(JSON.stringify(success({ following: true, followerCount: count })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('关注操作失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
