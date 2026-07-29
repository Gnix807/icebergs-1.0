import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { error, ErrorCodes, success } from '../../../lib/api';
import {
  CAPABILITIES,
  hasCapability,
  writeCapabilityAudit,
  type Capability,
} from '../../../lib/capabilities';

const DAY_MS = 86_400_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  const id = event.params.id;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少申请 ID'), 400);
  const application = await (prisma as any).capabilityApplication.findUnique({
    where: { id },
    include: { decisions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!application) return json(error(ErrorCodes.NOT_FOUND, '申请不存在'), 404);
  if (application.userId !== session.userId
    && !hasCapability(session, 'SITE_ADMINISTRATION')) {
    return json(error(ErrorCodes.FORBIDDEN, '无权查看该申请'), 403);
  }
  return json(success(application));
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
    return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
  }
  const body = await event.request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400);

  if (body.action === 'suspend') {
    const targetUserId = String(body.userId || '');
    const capability = String(body.capability || '') as Capability;
    const reason = String(body.reason || '').trim();
    if (!targetUserId || !CAPABILITIES.includes(capability)) {
      return json(error(ErrorCodes.VALIDATION_ERROR, '目标用户或能力无效'), 400);
    }
    if (targetUserId === session.userId) {
      return json(error(ErrorCodes.FORBIDDEN, '不能暂停自己的管理能力'), 403);
    }
    if (reason.length < 10) {
      return json(error(ErrorCodes.BREAK_GLASS_REASON_REQUIRED, '紧急暂停必须填写至少 10 字理由'), 400);
    }
    const suspendedUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const updated = await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as any;
      const capabilityRow = await tx.userCapability.update({
        where: { userId_capability: { userId: targetUserId, capability } },
        data: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendedUntil,
          reason,
        },
      });
      await writeCapabilityAudit({
        actorId: session.userId,
        subjectUserId: targetUserId,
        capability,
        action: 'EMERGENCY_SUSPEND',
        result: 'SUSPENDED',
        reason,
        breakGlass: session.isFounder,
        metadata: { suspendedUntil },
      }, tx);
      return capabilityRow;
    });
    return json(success(updated));
  }

  if (body.action === 'request-revocation') {
    const targetUserId = String(body.userId || '');
    const capability = String(body.capability || '') as Capability;
    const statement = String(body.reason || '').trim();
    if (!targetUserId || !CAPABILITIES.includes(capability) || statement.length < 20) {
      return json(error(ErrorCodes.VALIDATION_ERROR, '永久撤销必须填写至少 20 字的证据说明'), 400);
    }
    const application = await (prisma as any).capabilityApplication.create({
      data: {
        userId: targetUserId,
        capability,
        kind: 'REVOCATION',
        statement,
        createdById: session.userId,
      },
    });
    return json(success(application), 201);
  }

  if (body.action !== 'decide') {
    return json(error(ErrorCodes.BAD_REQUEST, '未知操作'), 400);
  }
  const id = event.params.id;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少申请 ID'), 400);
  const decision = String(body.decision || '');
  const reason = String(body.reason || '').trim();
  const breakGlass = body.breakGlass === true;
  if (!['APPROVE', 'REJECT'].includes(decision) || reason.length < 5) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '决定无效或理由少于 5 字'), 400);
  }
  if (breakGlass && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '只有创始人可以在人数不足时使用紧急兜底'), 403);
  }
  if (breakGlass && reason.length < 20) {
    return json(error(ErrorCodes.BREAK_GLASS_REASON_REQUIRED, '紧急兜底理由至少需要 20 字'), 400);
  }

  try {
    const result = await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as any;
      const application = await tx.capabilityApplication.findUnique({
        where: { id },
        include: { decisions: true },
      });
      if (!application) throw new Error('APPLICATION_NOT_FOUND');
      if (application.status !== 'PENDING') throw new Error('APPLICATION_RESOLVED');
      if (application.userId === session.userId && !breakGlass) throw new Error('DECISION_RECUSAL');

      await tx.capabilityDecision.create({
        data: {
          applicationId: id,
          reviewerId: session.userId,
          decision,
          reason,
        },
      });
      const decisions = await tx.capabilityDecision.findMany({ where: { applicationId: id } });
      const matching = decisions.filter((item: any) => item.decision === decision).length;
      const resolved = breakGlass || matching >= 2;

      await writeCapabilityAudit({
        actorId: session.userId,
        subjectUserId: application.userId,
        capability: application.capability,
        action: `${application.kind}_${decision}`,
        result: resolved ? decision : 'AWAITING_SECOND_APPROVAL',
        resourceType: 'capability-application',
        resourceId: application.id,
        reason,
        breakGlass,
      }, tx);

      if (!resolved) return { resolved: false, required: 2, received: matching };

      const finalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await tx.capabilityApplication.update({
        where: { id },
        data: { status: finalStatus, resolvedAt: new Date() },
      });
      if (decision === 'APPROVE') {
        if (application.kind === 'REVOCATION') {
          await tx.userCapability.updateMany({
            where: { userId: application.userId, capability: application.capability },
            data: {
              status: 'REVOKED',
              revokedAt: new Date(),
              suspendedAt: null,
              suspendedUntil: null,
              reason: application.statement,
            },
          });
        } else {
          const probationEndsAt = new Date(Date.now() + 30 * DAY_MS);
          await tx.userCapability.upsert({
            where: {
              userId_capability: {
                userId: application.userId,
                capability: application.capability,
              },
            },
            create: {
              userId: application.userId,
              capability: application.capability,
              status: application.kind === 'APPEAL' ? 'ACTIVE' : 'TRIAL',
              source: breakGlass ? 'BREAK_GLASS' : 'APPLICATION',
              grantedById: session.userId,
              probationEndsAt: application.kind === 'APPEAL' ? null : probationEndsAt,
              reason: application.statement,
            },
            update: {
              status: application.kind === 'APPEAL' ? 'ACTIVE' : 'TRIAL',
              source: breakGlass ? 'BREAK_GLASS' : 'APPLICATION',
              grantedById: session.userId,
              grantedAt: new Date(),
              probationEndsAt: application.kind === 'APPEAL' ? null : probationEndsAt,
              suspendedAt: null,
              suspendedUntil: null,
              revokedAt: null,
              reason: application.statement,
            },
          });
        }
      }
      return { resolved: true, status: finalStatus };
    });
    if (!result.resolved) {
      return json(error(
        ErrorCodes.SECOND_APPROVAL_REQUIRED,
        '已记录决定，等待另一名站点管理员复核',
        result,
      ), 409);
    }
    return json(success(result));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (message === 'APPLICATION_NOT_FOUND') return json(error(ErrorCodes.NOT_FOUND, '申请不存在'), 404);
    if (message === 'APPLICATION_RESOLVED') return json(error(ErrorCodes.CONFLICT, '申请已经处理'), 409);
    if (message === 'DECISION_RECUSAL') return json(error(ErrorCodes.FORBIDDEN, '不能审批自己的能力申请'), 403);
    if (message.includes('Unique constraint')) {
      return json(error(ErrorCodes.CONFLICT, '你已经对该申请作出决定'), 409);
    }
    console.error('[capabilities:decision]', cause);
    return json(error(ErrorCodes.INTERNAL_ERROR, '能力决定处理失败'), 500);
  }
}
