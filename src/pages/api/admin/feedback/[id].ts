/**
 * PATCH /api/admin/feedback/[id]  — 更新反馈处理状态
 */
import type { APIContext } from 'astro';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session || (session.role !== 'EDITOR' && session.role !== 'ADMIN')) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '无权限' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { id } = event.params as { id: string };

  if (event.request.method === 'DELETE') {
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

  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({})) as {
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

