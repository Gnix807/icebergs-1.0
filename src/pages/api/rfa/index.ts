/**
 * GET  /api/rfa  — 列出所有 OPEN 状态的 RfA（公开）
 * POST /api/rfa  — 提交 EDITOR 资格申请（需 CONTRIBUTOR）
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getRfaSettings } from '../../../lib/rfa';
import { notify } from '../../../lib/notify';

const db = prisma;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  const requests = await db.rfaRequest.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, statement: true, status: true, createdAt: true, closesAt: true,
      user: { select: { id: true, username: true, nickname: true, qualityScore: true } },
      _count: { select: { votes: true } },
    },
  });
  return json(success({ requests }));
}

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.role !== 'CONTRIBUTOR') {
    return json(error(ErrorCodes.FORBIDDEN, '仅 CONTRIBUTOR 可以申请编辑资格'), 403);
  }
  if (['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED', 'WARNED_2'].includes(session.status)) {
    return json(error(ErrorCodes.FORBIDDEN, '当前账号状态不允许申请'), 403);
  }

  const settings = await getRfaSettings();

  const [user, openRfa, recentRejected] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, qualityScore: true, createdAt: true },
    }),
    db.rfaRequest.findFirst({
      where: { userId: session.userId, status: 'OPEN' },
      select: { id: true },
    }),
    db.rfaRequest.findFirst({
      where: {
        userId: session.userId,
        status: 'REJECTED',
        resolvedAt: { gte: new Date(Date.now() - settings.cooldownDays * 86400_000) },
      },
      select: { resolvedAt: true },
    }),
  ]);

  if (!user) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

  // 门槛检查
  const daysSince = (Date.now() - user.createdAt.getTime()) / 86400_000;
  const reasons: string[] = [];
  if (user.qualityScore < settings.minScore)
    reasons.push(`质量分不足（当前 ${user.qualityScore}，需要 ${settings.minScore}）`);
  if (daysSince < settings.minDays)
    reasons.push(`注册时间不足（当前 ${Math.floor(daysSince)} 天，需要 ${settings.minDays} 天）`);
  if (reasons.length > 0)
    return json(error(ErrorCodes.FORBIDDEN, `不满足申请条件：${reasons.join('；')}`), 403);

  if (openRfa) return json(error(ErrorCodes.CONFLICT, '你已有进行中的 RfA'), 409);

  if (recentRejected?.resolvedAt) {
    const cooldownEnds = new Date(recentRejected.resolvedAt.getTime() + settings.cooldownDays * 86400_000);
    const daysLeft = Math.ceil((cooldownEnds.getTime() - Date.now()) / 86400_000);
    return json(error(ErrorCodes.FORBIDDEN, `冷却期内，还需等待 ${daysLeft} 天`), 403);
  }

  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));
  const statement = (typeof body.statement === 'string' ? body.statement.trim() : '').slice(0, 500);

  const closesAt = new Date(Date.now() + settings.voteDays * 86400_000);
  const rfa = await db.rfaRequest.create({
    data: { userId: session.userId, statement: statement || null, closesAt },
    select: { id: true, closesAt: true },
  });

  // 通知申请人
  notify(session.userId, 'rfa_submitted', 'RfA 已提交，投票开始', `投票将持续 ${settings.voteDays} 天`, `/rfa/${rfa.id}`);

  return json(success({ rfa }), 201);
}

