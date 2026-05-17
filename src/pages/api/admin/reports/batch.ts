/**
 * PUT /api/admin/reports/batch
 * EDITOR/ADMIN — batch resolve pending reports
 * Body: {
 *   ids: string[],
 *   action: 'RESOLVED_ACTION' | 'RESOLVED_DISMISSED',
 *   resolution: string
 * }
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

    const body = await event.request.json() as {
      ids?: string[];
      action?: string;
      resolution?: string;
    };

    const action = body.action;
    const resolution = (body.resolution ?? '').trim();
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id) => typeof id === 'string' && id.trim().length > 0))]
      : [];

    if (ids.length === 0) {
      return json(error(ErrorCodes.BAD_REQUEST, '请至少选择一条举报记录'), 400);
    }
    if (ids.length > 100) {
      return json(error(ErrorCodes.BAD_REQUEST, '单次最多处理 100 条'), 400);
    }
    if (action !== 'RESOLVED_ACTION' && action !== 'RESOLVED_DISMISSED') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 RESOLVED_ACTION 或 RESOLVED_DISMISSED'), 400);
    }
    if (resolution.length < 3) {
      return json(error(ErrorCodes.BAD_REQUEST, '处理说明不能为空'), 400);
    }

    const pendingReports = await prisma.report.findMany({
      where: { id: { in: ids }, status: 'PENDING' },
      select: { id: true, filerId: true },
    });

    if (pendingReports.length === 0) {
      return json(error(ErrorCodes.BAD_REQUEST, '所选举报均已处理'), 400);
    }

    const pendingIds = pendingReports.map((r) => r.id);
    const now = new Date();

    await prisma.report.updateMany({
      where: { id: { in: pendingIds }, status: 'PENDING' },
      data: {
        status: action,
        handlerId: session.userId,
        resolution,
        resolvedAt: now,
      },
    });

    const resultText = action === 'RESOLVED_ACTION' ? '已采取处理措施' : '举报已记录，暂不处理';
    pendingReports.forEach((report) => {
      if (!report.filerId) return;
      notify(
        report.filerId,
        'report_resolved',
        '你的举报已被处理',
        `${resultText}。处理说明：${resolution}`,
      );
    });

    return json(success({
      updated: pendingIds.length,
      skipped: ids.length - pendingIds.length,
      action,
    }));
  } catch (err) {
    console.error('批量处理举报失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '批量操作失败'), 500);
  }
}

