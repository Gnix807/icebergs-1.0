/**
 * POST /api/users/[id]/appeal
 *
 * Submit an appeal for account restriction.
 * Body: { type: AppealType, statement: string }
 *
 * Rules:
 *  - Only the account owner can submit an appeal for themselves.
 *  - WARNED_2: requires 180-day cooldown since last WARNED_2 warning.
 *  - READ_ONLY / TEMP_BANNED: no cooldown, but no duplicate PENDING appeals.
 *  - PERM_BANNED: same as above.
 *  - Statement must be ≥ 20 characters.
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';

const APPEAL_COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000;

const APPEALABLE_STATUSES = ['WARNED_2', 'READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'];

const STATUS_TO_APPEAL_TYPE: Record<string, string> = {
  WARNED_2:    'WARNED_2_CLEAR',
  READ_ONLY:   'READ_ONLY',
  TEMP_BANNED: 'TEMP_BAN',
  PERM_BANNED: 'PERM_BAN',
};

export async function POST(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);

    // Only the owner can appeal for themselves
    if (session.userId !== id) {
      return json(error(ErrorCodes.FORBIDDEN, '只能为自己提交申诉'), 403);
    }

    const body = await event.request.json() as { statement?: string };
    const { statement } = body;

    if (!statement || statement.trim().length < 20) {
      return json(error(ErrorCodes.BAD_REQUEST, '申诉说明至少需要 20 字'), 400);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!user) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

    if (!APPEALABLE_STATUSES.includes(user.status)) {
      return json(error(ErrorCodes.BAD_REQUEST, `当前账户状态「${user.status}」无需申诉`), 400);
    }

    // Check for existing pending appeal
    const existing = await prisma.appeal.findFirst({
      where: { userId: id, status: 'PENDING' },
    });
    if (existing) {
      return json(error(ErrorCodes.BAD_REQUEST, '已有一条待处理申诉，请等待管理员处理'), 400);
    }

    // WARNED_2 cooldown check
    if (user.status === 'WARNED_2') {
      const lastWarning = await prisma.userWarning.findFirst({
        where: { userId: id, level: 2, clearedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (!lastWarning) {
        return json(error(ErrorCodes.BAD_REQUEST, '未找到有效的警告记录'), 400);
      }
      const elapsed = Date.now() - lastWarning.createdAt.getTime();
      if (elapsed < APPEAL_COOLDOWN_MS) {
        const remaining = Math.ceil((APPEAL_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        return json(
          error(ErrorCodes.BAD_REQUEST, `申诉冷却期未满，还需等待 ${remaining} 天`),
          400,
        );
      }
    }

    const appealType = STATUS_TO_APPEAL_TYPE[user.status];
    const appeal = await prisma.appeal.create({
      data: {
        userId: id,
        type: appealType,
        statement: statement.trim(),
        status: 'PENDING',
      },
    });

    return json(success({ appealId: appeal.id, message: '申诉已提交，等待管理员审核' }), 201);
  } catch (err) {
    console.error('提交申诉失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '提交失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
