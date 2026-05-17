/**
 * POST /api/promotion/request
 *
 * Submit a USER → CONTRIBUTOR promotion request.
 * Eligibility checks (lazy evaluated):
 *   qualityScore >= 20
 *   icebergs created >= 2
 *   account age >= 7 days
 *   status === 'ACTIVE'
 *   no WARNED_2 in last 90 days
 *   no existing PENDING request
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

const EXPIRE_DAYS   = 30;

async function getThresholds() {
  const keys = ['contributor_min_score', 'contributor_min_icebergs', 'contributor_min_days', 'promotion_expire'];
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    minScore:    parseInt(map['contributor_min_score']    ?? '20', 10),
    minIcebergs: parseInt(map['contributor_min_icebergs'] ?? '2',  10),
    minDays:     parseInt(map['contributor_min_days']     ?? '7',  10),
    expireDays:  parseInt(map['promotion_expire']         ?? String(EXPIRE_DAYS), 10),
  };
}

export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const body = await event.request.json() as { statement?: string };
    const statement = (body.statement ?? '').trim().slice(0, 200);

    const [user, thresholds] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true, role: true, status: true, qualityScore: true, createdAt: true,
          _count: { select: { icebergs: true } },
        },
      }),
      getThresholds(),
    ]);
    if (!user) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

    // Already CONTRIBUTOR or higher
    if (user.role !== 'USER') {
      return json(error(ErrorCodes.BAD_REQUEST, `当前角色已为 ${user.role}，无需申请`), 400);
    }
    if (user.status !== 'ACTIVE') {
      return json(error(ErrorCodes.FORBIDDEN, '账户受限，无法提交晋升申请'), 403);
    }

    const { minScore, minIcebergs, minDays, expireDays } = thresholds;

    const reasons: string[] = [];
    if (user.qualityScore < minScore)
      reasons.push(`质量分不足（当前 ${user.qualityScore}，需要 ${minScore}）`);
    if (user._count.icebergs < minIcebergs)
      reasons.push(`冰山图数量不足（当前 ${user._count.icebergs}，需要 ${minIcebergs}）`);

    const ageDays = (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < minDays)
      reasons.push(`注册时间不足（还需 ${Math.ceil(minDays - ageDays)} 天）`);

    // Check WARNED_2 in last 90 days
    const recentWarn2 = await prisma.userWarning.findFirst({
      where: {
        userId: user.id, level: 2, clearedAt: null,
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentWarn2) reasons.push('90 天内有 WARNED_2 记录');

    if (reasons.length > 0) {
      return json(error(ErrorCodes.FORBIDDEN, '不满足申请条件', reasons), 403);
    }

    // Check existing PENDING request
    const existing = await prisma.promotionRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });
    if (existing) {
      return json(error(ErrorCodes.BAD_REQUEST, '已有一条待审请求，请等待审核'), 400);
    }

    const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
    const req = await prisma.promotionRequest.create({
      data: {
        userId: user.id,
        targetRole: 'CONTRIBUTOR',
        statement: statement || null,
        expiresAt,
      },
    });

    return json(success({ requestId: req.id, message: '申请已提交，等待编辑审批' }), 201);
  } catch (err) {
    console.error('提交晋升申请失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '提交失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

