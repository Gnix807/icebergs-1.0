import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { notify } from '../../../../lib/notify';
import { AWARD_TYPES } from '../../../../lib/awards';

const db = prisma as any;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ params }: APIEvent) {
  try {
    const awards = await db.userAward.findMany({
      where: { receiverId: params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, type: true, message: true, createdAt: true,
        giver: { select: { id: true, username: true, nickname: true } },
      },
    });
    return json(success(awards), 200);
  } catch {
    return json(error(ErrorCodes.INTERNAL_ERROR, '加载失败'), 500);
  }
}

export async function POST(event: APIEvent) {
  const session = await getSession(event);
  if (!session?.isFounder && session?.role !== 'ADMIN') {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员或站长权限'), 403);
  }

  const { id } = event.params;
  if (id === session.userId) return json(error(ErrorCodes.FORBIDDEN, '不能授予自己勋章'), 403);

  let body: { type?: string; message?: string };
  try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }

  const { type, message } = body;
  if (!type || !AWARD_TYPES.find(a => a.id === type)) {
    return json(error(ErrorCodes.BAD_REQUEST, '勋章类型无效'), 400);
  }
  if (message && message.length > 200) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '留言不超过 200 字'), 400);
  }

  const existing = await db.userAward.findFirst({ where: { receiverId: id, type } });
  if (existing) return json(error(ErrorCodes.BAD_REQUEST, '已授予过该类型勋章'), 409);

  const receiver = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!receiver) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

  const awardDef = AWARD_TYPES.find(a => a.id === type)!;
  const award = await db.userAward.create({
    data: { receiverId: id, giverId: session.userId, type, message: message?.trim() || null },
    select: { id: true, type: true },
  });

  await notify(id, 'award_received', `获得勋章：${awardDef.labelZh}`, message ?? undefined, undefined);

  return json(success(award), 200);
}

export async function DELETE(event: APIEvent) {
  const session = await getSession(event);
  if (!session?.isFounder && session?.role !== 'ADMIN') {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员或站长权限'), 403);
  }

  const url = new URL(event.request.url);
  const awardId = url.searchParams.get('awardId');
  if (!awardId) return json(error(ErrorCodes.BAD_REQUEST, '缺少 awardId'), 400);

  try {
    await db.userAward.delete({ where: { id: awardId } });
    return json(success({ deleted: true }), 200);
  } catch {
    return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
  }
}
