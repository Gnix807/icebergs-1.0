/**
 * PUT /api/admin/reports/[id]   EDITOR/ADMIN — resolve a report
 * Body: { action: 'RESOLVED_ACTION' | 'RESOLVED_DISMISSED', resolution: string }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'report:handle')) return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少举报 ID'), 400);

    const body = await event.request.json() as { action?: string; resolution?: string };
    const { action, resolution } = body;

    if (action !== 'RESOLVED_ACTION' && action !== 'RESOLVED_DISMISSED') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 RESOLVED_ACTION 或 RESOLVED_DISMISSED'), 400);
    }
    if (!resolution || resolution.trim().length < 3) {
      return json(error(ErrorCodes.BAD_REQUEST, '处理说明不能为空'), 400);
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return json(error(ErrorCodes.NOT_FOUND, '举报记录不存在'), 404);
    if (report.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, '该举报已处理'), 400);
    }

    await prisma.report.update({
      where: { id },
      data: {
        status: action,
        handlerId: session.userId,
        resolution: resolution.trim(),
        resolvedAt: new Date(),
      },
    });

    if (report.filerId) {
      notify(
        report.filerId,
        'report_resolved',
        '你的举报已处理',
        `处理结果：${resolution.trim()}`,
      );
    }

    return json(success({ action, reportId: id }));
  } catch (err) {
    console.error('处理举报失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

