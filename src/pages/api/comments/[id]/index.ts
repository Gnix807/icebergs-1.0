import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { hasRole } from '../../../../lib/permissions';

// DELETE /api/comments/[id] — 删除自己的评论，或 EDITOR+ 删除任意评论
export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const commentId = event.params.id!;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true },
  });
  if (!comment) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '评论不存在')), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const isOwn = comment.userId === session.userId;
  const isModerator = session.isFounder || hasRole(session.role, 'EDITOR');
  if (!isOwn && !isModerator) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权删除此评论')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return new Response(JSON.stringify(success(null)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

