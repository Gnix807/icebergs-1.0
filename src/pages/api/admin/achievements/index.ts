/**
 * GET  /api/admin/achievements  — ADMIN: list all achievement definitions
 * POST /api/admin/achievements  — ADMIN: create new achievement definition
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { hasCapability } from '../../../../lib/capabilities';
import { validateAchievementConditions } from '../../../../lib/achievementRules';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    try {
      const session = await getSession(event);
      if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
      if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
        return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
      }

      const body = JSON.parse(dataParam || '{}') as {
        key?: string; icon?: string; label?: string; labelZh?: string;
        desc?: string; color?: string; triggerType?: string;
        triggerTarget?: number; sortOrder?: number; isHidden?: boolean;
        conditions?: string; category?: string;
      };

      if (!body.key?.trim() || !body.icon?.trim() || !body.labelZh?.trim() || !body.desc?.trim()) {
        return json(error(ErrorCodes.BAD_REQUEST, '缺少必填字段'), 400);
      }

      const existing = await prisma.achievement.findUnique({ where: { key: body.key.trim() } });
      if (existing) return json(error(ErrorCodes.CONFLICT, '该 key 已存在'), 409);
      const conditionCheck = validateAchievementConditions(body.conditions ?? '[]');
      if (!conditionCheck.valid) {
        return json(error(ErrorCodes.VALIDATION_ERROR, conditionCheck.message!), 400);
      }

      const achievement = await prisma.achievement.create({
        data: {
          key:           body.key.trim(),
          icon:          body.icon.trim(),
          label:         body.label?.trim() || body.labelZh!.trim(),
          labelZh:       body.labelZh!.trim(),
          desc:          body.desc!.trim(),
          color:         body.color?.trim() || '#6b7280',
          triggerType:   body.triggerType ?? 'manual',
          triggerTarget: body.triggerTarget ?? 0,
          sortOrder:     body.sortOrder ?? 0,
          isHidden:      body.isHidden ?? false,
          conditions:    body.conditions ?? '[]',
          category:      body.category || null,
          ruleVersion:   1,
          lifecycle:     'ACTIVE',
        },
      } as any);

      return json(success(achievement), 201);
    } catch (err) {
      console.error('创建成就失败:', err);
      return json(error(ErrorCodes.INTERNAL_ERROR, '创建失败'), 500);
    }

  }

  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }

    const achievements = await prisma.achievement.findMany({ orderBy: { sortOrder: 'asc' } });
    return json(success(achievements), 200);
  } catch (err) {
    console.error('获取成就配置失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}
