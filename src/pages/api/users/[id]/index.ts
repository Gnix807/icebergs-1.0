import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';

// GET /api/users/:id - 获取用户信息
export async function GET(event: APIContext) {
  try {
    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: { icebergs: true },
        },
      },
    });

    if (!user) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '用户不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(success(user)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// PUT /api/users/:id — 更新个人资料（仅本人）
export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (session.userId !== id) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权修改')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));

    const data: Record<string, unknown> = {};
    if (typeof body.bio === 'string') data.bio = body.bio.slice(0, 200);
    if (typeof body.avatar === 'string') data.avatar = body.avatar.slice(0, 500);
    if (typeof body.nickname === 'string') data.nickname = body.nickname.slice(0, 50);
    if (typeof body.privacyShowStats === 'boolean') data.privacyShowStats = body.privacyShowStats;
    if (typeof body.privacyShowWatchlist === 'boolean') data.privacyShowWatchlist = body.privacyShowWatchlist;

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, username: true, nickname: true, bio: true,
        avatar: true, privacyShowStats: true, privacyShowWatchlist: true,
      },
    });

    return new Response(JSON.stringify(success(updated)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新用户信息失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

