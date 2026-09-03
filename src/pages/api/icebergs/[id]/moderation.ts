import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth';
import { hasCapability, writeCapabilityAudit } from '../../../../lib/capabilities';
import {
  getIcebergModerationTransition,
  isAllowedRequestOrigin,
  parseIcebergModerationRequest,
} from '../../../../lib/icebergModeration';
import { notify } from '../../../../lib/notify';
import { prisma } from '../../../../lib/prisma';

class ModerationConflictError extends Error {}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(event: APIContext) {
  try {
    const origin = event.request.headers.get('origin');
    if (!isAllowedRequestOrigin(event.url, origin, process.env.REDIRECT_URI)) {
      return json(error(ErrorCodes.FORBIDDEN, '拒绝跨站管理请求'), 403);
    }

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'COMMUNITY_MODERATION')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要社区管理权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少冰山图 ID'), 400);

    const request = parseIcebergModerationRequest(
      await event.request.json().catch(() => null),
    );
    if (!request.ok) return json(error(ErrorCodes.BAD_REQUEST, request.message), 400);

    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: {
        id: true,
        slug: true,
        title: true,
        authorId: true,
        status: true,
      },
    });
    if (!iceberg) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);

    const publication = request.value.action === 'RESTORE'
      ? await (prisma as any).icebergPublication.findUnique({
          where: { icebergId: iceberg.id },
          select: { id: true },
        })
      : null;
    const transition = getIcebergModerationTransition(
      iceberg.status,
      request.value.action,
      request.value.action === 'ARCHIVE' || !!publication,
    );
    if (transition.kind === 'invalid') {
      return json(error(ErrorCodes.CONFLICT, transition.message), 409);
    }
    if (transition.kind === 'noop') {
      return json(success({
        changed: false,
        icebergId: iceberg.id,
        status: transition.to,
      }));
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.iceberg.updateMany({
          where: { id: iceberg.id, status: transition.from },
          data: { status: transition.to, updatedAt: new Date() },
        });
        if (updated.count !== 1) throw new ModerationConflictError();

        await writeCapabilityAudit({
          actorId: session.userId,
          subjectUserId: iceberg.authorId,
          capability: 'COMMUNITY_MODERATION',
          action: request.value.action === 'ARCHIVE'
            ? 'ICEBERG_ARCHIVED'
            : 'ICEBERG_RESTORED',
          result: 'SUCCESS',
          resourceType: 'iceberg',
          resourceId: iceberg.id,
          reason: request.value.reason,
          metadata: {
            title: iceberg.title,
            slug: iceberg.slug,
            previousStatus: transition.from,
            nextStatus: transition.to,
          },
        }, tx);
      }, { isolationLevel: 'Serializable' });
    } catch (err) {
      if (err instanceof ModerationConflictError
        || (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')) {
        return json(error(
          ErrorCodes.CONFLICT,
          '冰山图状态已被其他人修改，请刷新后重试',
        ), 409);
      }
      throw err;
    }

    const archived = request.value.action === 'ARCHIVE';
    await notify(
      iceberg.authorId,
      archived ? 'iceberg_archived' : 'iceberg_restored',
      archived
        ? `冰山图《${iceberg.title}》已被下架`
        : `冰山图《${iceberg.title}》已恢复公开`,
      `处理理由：${request.value.reason}`,
      `/iceberg/${encodeURIComponent(iceberg.slug || iceberg.id)}`,
    );

    return json(success({
      changed: true,
      icebergId: iceberg.id,
      status: transition.to,
    }));
  } catch (err) {
    console.error('冰山图管理操作失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}
