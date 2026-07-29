/**
 * PUT    /api/admin/achievements/[id]  — ADMIN: update achievement definition
 * DELETE /api/admin/achievements/[id]  — ADMIN: delete achievement definition
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { hasCapability } from '../../../../lib/capabilities';
import {
  isAchievementLifecycle,
  validateAchievementConditions,
} from '../../../../lib/achievementRules';

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
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }

    const { id } = event.params as { id: string };
    const existing = await prisma.achievement.findUnique({ where: { id } });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '成就不存在'), 404);

    if (event.request.method === 'DELETE' || event.url.searchParams.get('action') === 'delete') {
      const archived = await prisma.achievement.update({
        where: { id },
        data: { lifecycle: 'ARCHIVED' },
      } as any);
      return json(success({ archived: true, achievement: archived }), 200);
    }

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({})) as {
      icon?: string; label?: string; labelZh?: string; desc?: string;
      color?: string; triggerType?: string; triggerTarget?: number;
      sortOrder?: number; isHidden?: boolean; conditions?: string; category?: string | null;
      lifecycle?: string;
    };
    if (body.conditions != null) {
      const conditionCheck = validateAchievementConditions(body.conditions);
      if (!conditionCheck.valid) {
        return json(error(ErrorCodes.VALIDATION_ERROR, conditionCheck.message!), 400);
      }
    }
    if (body.lifecycle !== undefined && !isAchievementLifecycle(body.lifecycle)) {
      return json(error(ErrorCodes.VALIDATION_ERROR, '无效的成就生命周期'), 400);
    }
    const rulesChanged = body.conditions !== undefined
      || body.triggerType !== undefined
      || body.triggerTarget !== undefined;

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
        ...(body.lifecycle    !== undefined && { lifecycle: body.lifecycle            }),
        ...(rulesChanged && { ruleVersion: { increment: 1 } }),
      },
    } as any);

    return json(success(updated), 200);
  } catch (err) {
    console.error('更新成就失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500);
  }
}
