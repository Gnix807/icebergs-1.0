/**
 * GET  /api/elections  — 公开，列出所有选举（倒序）
 * POST /api/elections  — ADMIN/FOUNDER，发起新选举
 *   body: { title?, description?, applyDays?, voteDays? }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  const elections = await prisma.election.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, description: true, status: true,
      applyDeadline: true, voteDeadline: true, confirmedAt: true,
      winnerId: true, createdAt: true,
      _count: { select: { candidates: true, votes: true } },
    },
  });
  return json(success({ elections }));
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.role !== 'ADMIN' && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
  }

  const body = await event.request.json() as {
    title?: string;
    description?: string;
    applyDays?: number;
    voteDays?: number;
  };

  // 从 system_settings 读取默认天数
  const [applySetting, voteSetting] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { key: 'election_apply_days' } }),
    prisma.systemSettings.findUnique({ where: { key: 'election_vote_days' } }),
  ]);
  const applyDays = Math.max(1, body.applyDays ?? parseInt(applySetting?.value ?? '7', 10));
  const voteDays  = Math.max(1, body.voteDays  ?? parseInt(voteSetting?.value  ?? '14', 10));

  const now           = new Date();
  const applyDeadline = new Date(now.getTime() + applyDays * 86400_000);
  const voteDeadline  = new Date(applyDeadline.getTime() + voteDays * 86400_000);

  // 检查是否已有进行中的选举
  const ongoing = await prisma.election.findFirst({
    where: { status: { in: ['OPEN_APPLY', 'VOTING'] } },
  });
  if (ongoing) {
    return json(error(ErrorCodes.BAD_REQUEST, '已有进行中的选举，请先关闭后再发起'), 400);
  }

  const election = await prisma.election.create({
    data: {
      initiatedBy: session.userId,
      title:       body.title?.trim() || '站长选举',
      description: body.description?.trim() || null,
      applyDeadline,
      voteDeadline,
    },
  });

  return json(success({ election }), 201);
}

