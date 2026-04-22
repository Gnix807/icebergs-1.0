/**
 * PATCH /api/admin/feedback/[id]  — 更新反馈处理状态
 */
import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';

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

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status: body.status,
      resolvedNote: body.resolvedNote?.trim() || null,
      resolvedAt: body.status !== 'pending' ? new Date() : null,
    },
  });

  return new Response(
    JSON.stringify({ success: true, data: updated }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
