import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { error, ErrorCodes, success } from '../../../lib/api';
import { hasCapability } from '../../../lib/capabilities';
import { resolveReviewAudit } from '../../../lib/reviewerCertification';
import { checkAchievements } from '../../../lib/achievementService';

function mayAuditReviews(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session) return false;
  if (hasCapability(session, 'SITE_ADMINISTRATION')) return true;
  return session.capabilityStates?.some((state) =>
    state.capability === 'PUBLICATION_REVIEW' && state.status === 'ACTIVE') ?? false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (!mayAuditReviews(session)) {
    return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要正式发布审核能力'), 403);
  }
  const rows = await (prisma as any).reviewAudit.findMany({
    where: {
      outcome: 'PENDING',
      reviewerId: { not: session.userId },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return json(success(rows));
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (!mayAuditReviews(session)) {
    return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要正式发布审核能力'), 403);
  }
  const body = await event.request.json().catch(() => null) as Record<string, unknown> | null;
  const outcome = String(body?.outcome || '') as 'PASS' | 'ERROR' | 'SERIOUS';
  const reason = String(body?.reason || '').trim();
  if (!body?.auditId || !['PASS', 'ERROR', 'SERIOUS'].includes(outcome)) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '审计结果无效'), 400);
  }
  if (outcome !== 'PASS' && reason.length < 5) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '发现问题时必须填写至少 5 字说明'), 400);
  }
  try {
    const result = await resolveReviewAudit({
      auditId: String(body.auditId),
      auditorId: session.userId,
      outcome,
      reason,
    });
    if (outcome === 'PASS' && result?.reviewerId) {
      checkAchievements(result.reviewerId, { type: 'review' }).catch(() => {});
    }
    return json(success(result));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (message === 'AUDIT_NOT_PENDING') return json(error(ErrorCodes.CONFLICT, '该审计已经处理'), 409);
    if (message === 'AUDIT_RECUSAL') return json(error(ErrorCodes.FORBIDDEN, '不能审计自己的审核决定'), 403);
    console.error('[review-audits]', cause);
    return json(error(ErrorCodes.INTERNAL_ERROR, '审计处理失败'), 500);
  }
}
