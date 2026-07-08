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
    const claimants = await prisma.ideaClaimant.findMany({
      where: { ideaId: id },
      select: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    });
    return new Response(JSON.stringify(success({ claimants: claimants.map(c => c.user) })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  });

  try {
    let body: { userId?: string };
    try { body = await event.request.json(); } catch {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!body.userId) return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 userId')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });

    const targetUserId = body.userId === 'current' ? session.userId : body.userId;

    // Toggle: if exists, remove; else add
    const existing = await prisma.ideaClaimant.findUnique({
      where: { ideaId_userId: { ideaId: id!, userId: targetUserId } },
    });

    if (existing) {
      await prisma.ideaClaimant.delete({ where: { id: existing.id } });
    } else {
      await prisma.ideaClaimant.create({ data: { ideaId: id!, userId: targetUserId } });
    }

    const claimants = await prisma.ideaClaimant.findMany({
      where: { ideaId: id },
      select: { user: { select: { id: true, username: true, nickname: true, avatar: true } } },
    });

    return new Response(JSON.stringify(success({ claimants: claimants.map(c => c.user) })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新认领者失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
