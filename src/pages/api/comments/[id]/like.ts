import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { awardCommentLikeScore } from '../../../../lib/activityScore';
import { notifyAggregated } from '../../../../lib/notify';

// POST /api/comments/[id]/like — 点赞/取消点赞
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

  const existing = await prisma.commentLike.findUnique({
    where: { commentId_userId: { commentId, userId: session.userId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.commentLike.delete({ where: { id: existing.id } });
    return new Response(JSON.stringify(success({ liked: false })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } else {
    await prisma.commentLike.create({ data: { commentId, userId: session.userId } });
    if (comment.userId && comment.userId !== session.userId) {
      awardCommentLikeScore(comment.userId);
      notifyAggregated(
        comment.userId,
        'comment_liked',
        `comment:${commentId}`,
        n => n === 1 ? '有人点赞了你的评论' : `${n} 人点赞了你的评论`,
      );
    }
    return new Response(JSON.stringify(success({ liked: true })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
}

