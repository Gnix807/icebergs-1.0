/**
 * PUT    /api/admin/achievements/[id]  — ADMIN: update achievement definition
 * DELETE /api/admin/achievements/[id]  — ADMIN: delete achievement definition
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:ban')) return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);

    const { id } = event.params as { id: string };
    const existing = await prisma.achievement.findUnique({ where: { id } });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '成就不存在'), 404);

    if (event.request.method === 'DELETE') {
      await prisma.achievement.delete({ where: { id } });
      return json(success({ deleted: true }), 200);
    }

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({})) as {
      icon?: string; label?: string; labelZh?: string; desc?: string;
      color?: string; triggerType?: string; triggerTarget?: number;
      sortOrder?: number; isHidden?: boolean; conditions?: string; category?: string | null;
    };

    const updated = await prisma.achievement.update({
      where: { id },
      data: {
        ...(body.icon          != null && { icon:          body.icon.trim()          }),
        ...(body.label         != null && { label:         body.label.trim()         }),
        ...(body.labelZh       != null && { labelZh:       body.labelZh.trim()       }),
        ...(body.desc          != null && { desc:          body.desc.trim()          }),
        ...(body.color         != null && { color:         body.color.trim()         }),
        ...(body.triggerType   != null && { triggerType:   body.triggerType          }),
        ...(body.triggerTarget != null && { triggerTarget: body.triggerTarget        }),
        ...(body.sortOrder     != null && { sortOrder:     body.sortOrder            }),
        ...(body.isHidden      != null && { isHidden:      body.isHidden             }),
        ...(body.conditions    != null && { conditions:    body.conditions           }),
        ...(body.category     !== undefined && { category:  body.category || null     }),
      },
    } as any);

    return json(success(updated), 200);
  } catch (err) {
    console.error('更新成就失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500);
  }
}

