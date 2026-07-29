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
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error } from '../../../../lib/api';
import { notify } from '../../../../lib/notify';
import { legacyGovernanceWritesEnabled } from '../../../../lib/governance';

export async function ALL(event: APIContext) {
  // 鉴权
  const secret = process.env.CRON_SECRET;
  const auth = event.request.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify(error('FORBIDDEN', '无效密钥')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!await legacyGovernanceWritesEnabled()) {
    return new Response(JSON.stringify(error('LEGACY_GOVERNANCE_RETIRED', '选举推进任务已停用')), {
      status: 409,
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

      // 通知所有 RUNNING 候选人阶段变化
      const candidates = await prisma.electionCandidate.findMany({
        where: { electionId: election.id, status: 'RUNNING' },
        select: { userId: true },
      });
      const link = `/elections/${election.id}`;
      for (const c of candidates) {
        if (newStatus === 'VOTING') {
          notify(c.userId, 'election_phase_changed', '选举进入投票阶段', '报名期已结束，投票现已开放，请关注选举进度。', link);
        } else if (newStatus === 'CLOSED') {
          notify(c.userId, 'election_phase_changed', '选举投票已结束', '投票期已结束，等待管理员确认最终结果。', link);
        }
      }
    }
  }

  return new Response(
    JSON.stringify(success({ advanced: results.length, results })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
