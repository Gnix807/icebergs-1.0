/**
 * POST /api/admin/cron/advance-rfa
 *
 * 关闭所有超时的 OPEN RfA，评估投票结果，并执行晋升或拒绝。
 *
 * 鉴权：请求头 Authorization: Bearer <CRON_SECRET>
 *
 * 建议每 15 分钟调用一次：
 *   curl -X POST https://yourdomain.com/api/admin/cron/advance-rfa \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error } from '../../../../lib/api';
import { getRfaSettings, evaluateRfa } from '../../../../lib/rfa';
import { notify } from '../../../../lib/notify';

const db = prisma;

export async function POST(event: APIContext) {
  const secret = process.env.CRON_SECRET;
  const auth = event.request.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify(error('FORBIDDEN', '无效密钥')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const settings = await getRfaSettings();

  // 找出所有已超时的 OPEN RfA
  const expiredRfas = await db.rfaRequest.findMany({
    where: { status: 'OPEN', closesAt: { lte: now } },
    select: {
      id: true, userId: true,
      votes: { select: { vote: true, weight: true } },
    },
  });

  const results: { id: string; outcome: string; userId: string }[] = [];

  for (const rfa of expiredRfas) {
    const outcome = evaluateRfa(rfa.votes, settings);
    const resolvedAt = now;

    if (outcome === 'APPROVED') {
      // 晋升用户到 EDITOR
      await Promise.all([
        prisma.user.update({
          where: { id: rfa.userId },
          data: { role: 'EDITOR' },
        }),
        db.rfaRequest.update({
          where: { id: rfa.id },
          data: { status: 'APPROVED', resolvedAt },
        }),
      ]);
      notify(rfa.userId, 'rfa_approved', '恭喜！你已成为编辑', '你的编辑资格申请已通过，现在拥有 EDITOR 权限', `/rfa/${rfa.id}`);
    } else {
      await db.rfaRequest.update({
        where: { id: rfa.id },
        data: { status: 'REJECTED', resolvedAt },
      });
      notify(rfa.userId, 'rfa_rejected', '编辑资格申请未通过', `票数或支持率未达到要求，冷却 ${settings.cooldownDays} 天后可再次申请`, `/rfa/${rfa.id}`);
    }

    results.push({ id: rfa.id, outcome, userId: rfa.userId });
  }

  return new Response(
    JSON.stringify(success({ advanced: results.length, results })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

