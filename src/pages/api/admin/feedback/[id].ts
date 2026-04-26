/**
 * PATCH /api/admin/feedback/[id]  — 更新反馈处理状态
 */
import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';
import { notify } from '../../../../lib/notify';

export async function PATCH(event: APIEvent) {
  const session = await getSession(event);
  if (!session || (session.role !== 'EDITOR' && session.role !== 'ADMIN')) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '无权限' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { id } = event.params as { id: string };
  const body = await event.request.json() as {
    status: 'pending' | 'resolved' | 'wontfix';
    resolvedNote?: string;
  };

  if (!['pending', 'resolved', 'wontfix'].includes(body.status)) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '无效状态' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { userId: true } });

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status: body.status,
      resolvedNote: body.resolvedNote?.trim() || null,
      resolvedAt: body.status !== 'pending' ? new Date() : null,
    },
  });

  if (feedback?.userId && body.status !== 'pending') {
    const statusText = body.status === 'resolved' ? '已解决' : '暂不处理';
    const noteText = body.resolvedNote?.trim() ? `：${body.resolvedNote.trim()}` : '';
    notify(
      feedback.userId,
      'feedback_resolved',
      '你的反馈已被处理',
      `处理结果：${statusText}${noteText}`,
    );
  }

  return new Response(
    JSON.stringify({ success: true, data: updated }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
