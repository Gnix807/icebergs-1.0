/**
 * POST /api/admin/cron/advance-impeach
 *
 * 推进所有已过期的 OPEN 弹劾案：评估结果，通过则降级目标用户。
 * 鉴权：Authorization: Bearer <CRON_SECRET>
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error } from '../../../../lib/api';
import { evaluateImpeach, demotedRole, getImpeachSettings } from '../../../../lib/impeach';
import { notify } from '../../../../lib/notify';

export async function ALL(event: APIContext) {
  const secret = process.env.CRON_SECRET;
  const auth   = event.request.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify(error('FORBIDDEN', '无效密钥')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const now      = new Date();
  const settings = await getImpeachSettings();

  const expired = await prisma.impeachRequest.findMany({
    where: { status: 'OPEN', closesAt: { lt: now } },
    select: {
      id: true, targetUserId: true, targetRole: true,
      votes: { select: { vote: true, weight: true } },
    },
  });

  const results: { id: string; outcome: string }[] = [];

  for (const req of expired) {
    const outcome = evaluateImpeach(req.votes, settings);
    const resolvedAt = new Date();

    if (outcome === 'PASSED') {
      const newRole = demotedRole(req.targetRole);
      await Promise.all([
        prisma.user.update({ where: { id: req.targetUserId }, data: { role: newRole } }),
        prisma.impeachRequest.update({ where: { id: req.id }, data: { status: 'PASSED', resolvedAt } }),
      ]);
      notify(
        req.targetUserId,
        'impeach_passed',
        '弹劾案已通过，角色已降级',
        `你的角色已从 ${req.targetRole} 降为 ${newRole}`,
        `/impeach/${req.id}`,
      );
    } else {
      await prisma.impeachRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', resolvedAt } });
      notify(
        req.targetUserId,
        'impeach_rejected',
        '弹劾案未通过',
        '针对你的弹劾案票数未达通过门槛，已驳回',
        `/impeach/${req.id}`,
      );
    }
    results.push({ id: req.id, outcome });
  }

  return new Response(
    JSON.stringify(success({ processed: results.length, results })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

