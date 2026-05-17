/**
 * PATCH /api/admin/feedback/[id]  — 更新反馈处理状态
 */
import type { APIContext } from 'astro';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';

export async function PATCH(event: APIContext) {
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

/**
 * DELETE /api/admin/feedback/[id]  — 删除反馈
 */
export async function DELETE(event: APIContext) {
  const session = await getSession(event);
  if (!session || (session.role !== 'EDITOR' && session.role !== 'ADMIN')) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '无权限' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { id } = event.params as { id: string };
  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '缺少反馈 ID' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const existed = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existed) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '反馈不存在' } }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await prisma.feedback.delete({ where: { id } });

  return new Response(
    JSON.stringify({ success: true, data: { id } }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

