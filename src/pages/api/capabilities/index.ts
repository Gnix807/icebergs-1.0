import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { error, ErrorCodes, success } from '../../../lib/api';
import {
  CAPABILITIES,
  hasCapability,
  type Capability,
} from '../../../lib/capabilities';
import { evaluateReviewerEligibility } from '../../../lib/reviewerCertification';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(event: APIContext) {
  const session = await getSession(event);
  const scope = event.url.searchParams.get('scope');
  if (scope === 'active') {
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }
    try {
      const rows = await (prisma as any).userCapability.findMany({
        where: { status: { in: ['TRIAL', 'ACTIVE', 'SUSPENDED'] } },
        orderBy: [{ capability: 'asc' }, { grantedAt: 'asc' }],
        take: 500,
      });
      const userIds = [...new Set(rows.map((item: any) => item.userId))] as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true, avatar: true },
      });
      const usersById = Object.fromEntries(users.map((user) => [user.id, user]));
      return json(success(rows.map((row: any) => ({
        ...row,
        user: usersById[row.userId] ?? null,
      }))));
    } catch (cause) {
      console.warn('[capabilities:get-active] storage unavailable during additive rollout');
      return json(success([]));
    }
  }
  if (scope === 'applications') {
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }
    try {
      const applications = await (prisma as any).capabilityApplication.findMany({
        where: { status: 'PENDING' },
        include: { decisions: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      const userIds = [...new Set(applications.map((item: any) => item.userId))] as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true, avatar: true },
      });
      const usersById = Object.fromEntries(users.map((user) => [user.id, user]));
      return json(success(applications.map((application: any) => ({
        ...application,
        user: usersById[application.userId] ?? null,
      }))));
    } catch (cause) {
      console.warn('[capabilities:get-applications] storage unavailable during additive rollout');
      return json(success([]));
    }
  }
  const requestedUserId = event.url.searchParams.get('userId') || session?.userId;
  if (!requestedUserId) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const isOwner = session?.userId === requestedUserId;
  const canAdminister = hasCapability(session, 'SITE_ADMINISTRATION');
  try {
    const [states, certification, applications] = await Promise.all([
      (prisma as any).userCapability.findMany({
        where: {
          userId: requestedUserId,
          ...(isOwner || canAdminister ? {} : { status: { in: ['TRIAL', 'ACTIVE'] } }),
        },
        orderBy: { createdAt: 'asc' },
      }),
      (prisma as any).reviewerCertification.findUnique({
        where: { userId: requestedUserId },
      }),
      isOwner || canAdminister
        ? (prisma as any).capabilityApplication.findMany({
            where: { userId: requestedUserId },
            include: { decisions: true },
            orderBy: { createdAt: 'desc' },
            take: 30,
          })
        : Promise.resolve([]),
    ]);
    return json(success({
      capabilities: states,
      certification,
      applications,
      effective: isOwner ? session?.capabilities ?? [] : undefined,
    }));
  } catch (cause) {
    console.warn('[capabilities:get] storage unavailable during additive rollout');
    return json(success({
      capabilities: [],
      certification: null,
      applications: [],
      effective: isOwner ? session?.capabilities ?? [] : undefined,
      migrationPending: true,
    }));
  }
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'].includes(session.status)) {
    return json(error(ErrorCodes.FORBIDDEN, '当前账号状态不能申请能力'), 403);
  }
  const body = await event.request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400);

  if (body.action === 'evaluate-reviewer') {
    try {
      const result = await evaluateReviewerEligibility(session.userId);
      return json(success(result));
    } catch (cause) {
      console.error('[capabilities:evaluate-reviewer]', cause);
      return json(error(ErrorCodes.INTERNAL_ERROR, '审核资格评估失败'), 500);
    }
  }

  const capability = String(body.capability || '') as Capability;
  if (!CAPABILITIES.includes(capability)) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '能力类型无效'), 400);
  }
  if (body.action === 'appeal') {
    const statement = String(body.statement || '').trim();
    if (statement.length < 20 || statement.length > 2_000) {
      return json(error(ErrorCodes.VALIDATION_ERROR, '申诉说明需为 20–2000 字'), 400);
    }
    const capabilityRow = await (prisma as any).userCapability.findUnique({
      where: { userId_capability: { userId: session.userId, capability } },
    });
    if (!capabilityRow || !['SUSPENDED', 'REVOKED'].includes(capabilityRow.status)) {
      return json(error(ErrorCodes.CONFLICT, '该能力当前不需要申诉'), 409);
    }
    const pending = await (prisma as any).capabilityApplication.findFirst({
      where: {
        userId: session.userId,
        capability,
        kind: 'APPEAL',
        status: 'PENDING',
      },
    });
    if (pending) return json(error(ErrorCodes.CONFLICT, '该能力已有待处理申诉'), 409);
    const appeal = await (prisma as any).capabilityApplication.create({
      data: {
        userId: session.userId,
        capability,
        kind: 'APPEAL',
        statement,
        createdById: session.userId,
      },
    });
    return json(success(appeal), 201);
  }
  if (capability === 'PUBLICATION_REVIEW') {
    return json(error(
      ErrorCodes.CERTIFICATION_PROBATION,
      '发布审核能力由可审计贡献记录自动认证，请使用资格评估',
    ), 409);
  }

  const targetUserId = typeof body.userId === 'string' ? body.userId : session.userId;
  if (targetUserId !== session.userId && !hasCapability(session, 'SITE_ADMINISTRATION')) {
    return json(error(ErrorCodes.FORBIDDEN, '无权为其他用户创建申请'), 403);
  }
  if (capability === 'SITE_ADMINISTRATION'
    && !hasCapability(session, 'SITE_ADMINISTRATION')
    && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '站点管理能力只能由现任站点管理员提名'), 403);
  }

  const statement = String(body.statement || '').trim();
  if (statement.length < 20 || statement.length > 2_000) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '申请说明需为 20–2000 字'), 400);
  }
  const existing = await (prisma as any).capabilityApplication.findFirst({
    where: { userId: targetUserId, capability, kind: 'APPLICATION', status: 'PENDING' },
  });
  if (existing) {
    return json(error(ErrorCodes.CONFLICT, '该能力已有待处理申请', { applicationId: existing.id }), 409);
  }

  const application = await (prisma as any).capabilityApplication.create({
    data: {
      userId: targetUserId,
      capability,
      kind: 'APPLICATION',
      statement,
      createdById: session.userId,
    },
  });
  return json(success(application), 201);
}
