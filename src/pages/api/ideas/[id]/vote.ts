import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function ALL(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!id) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const idea = await prisma.idea.findUnique({ where: { id } });
    if (!idea) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '创意不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Toggle vote
    const existing = await prisma.ideaVote.findUnique({
      where: { ideaId_userId: { ideaId: id, userId: session.userId } },
    });

    if (existing) {
      await prisma.ideaVote.delete({ where: { id: existing.id } });
      const voteCount = await prisma.ideaVote.count({ where: { ideaId: id } });
      return new Response(JSON.stringify(success({ voted: false, voteCount })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.ideaVote.create({ data: { ideaId: id, userId: session.userId } });
    const voteCount = await prisma.ideaVote.count({ where: { ideaId: id } });
    return new Response(JSON.stringify(success({ voted: true, voteCount })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创意投票失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '投票失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
