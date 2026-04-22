/**
 * POST /api/admin/cron/advance-elections
 *
 * 批量推进所有超时选举的状态：
 *   OPEN_APPLY → VOTING  （applyDeadline 已过）
 *   VOTING     → CLOSED  （voteDeadline 已过）
 *
 * 鉴权：请求头 Authorization: Bearer <CRON_SECRET>
 *
 * 建议用系统 cron / 任务计划每 15 分钟调用一次：
 *   curl -X POST https://yourdomain.com/api/admin/cron/advance-elections \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../../lib/prisma';
import { success, error } from '../../../../lib/api';

export async function POST(event: APIEvent) {
  // 鉴权
  const secret = process.env.CRON_SECRET;
  const auth = event.request.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify(error('FORBIDDEN', '无效密钥')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const results: { id: string; from: string; to: string }[] = [];

  // 找出所有需要推进的选举
  const pending = await prisma.election.findMany({
    where: {
      status: { in: ['OPEN_APPLY', 'VOTING'] },
    },
    select: { id: true, status: true, applyDeadline: true, voteDeadline: true },
  });

  for (const election of pending) {
    let newStatus: string | null = null;

    if (election.status === 'OPEN_APPLY' && now >= election.applyDeadline) {
      newStatus = 'VOTING';
    } else if (election.status === 'VOTING' && now >= election.voteDeadline) {
      newStatus = 'CLOSED';
    }

    if (newStatus) {
      await prisma.election.update({
        where: { id: election.id },
        data: { status: newStatus },
      });
      results.push({ id: election.id, from: election.status, to: newStatus });
    }
  }

  return new Response(
    JSON.stringify(success({ advanced: results.length, results })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
