import type { APIContext } from 'astro';
import { getSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { notify } from '../../../../lib/notify';
import { AWARD_TYPES } from '../../../../lib/awards';

const db = prisma;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET({ params }: APIContext) {
  try {
    if (!params.id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
    const userId = params.id;
    const awards = await db.userAward.findMany({
      where: { receiverId: userId },
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

export async function ALL(event: APIContext) {
  const url = new URL(event.request.url);
  const session = await getSession(event);
  if (!session?.isFounder && session?.role !== 'ADMIN') {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员或站长权限'), 403);
  }

  const { id } = event.params;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
  const userId = id;

  // DELETE path: ?action=delete&awardId=xxx or method DELETE
  if (event.request.method === 'DELETE' || url.searchParams.get('action') === 'delete') {
    const awardId = url.searchParams.get('awardId');
    if (!awardId) return json(error(ErrorCodes.BAD_REQUEST, '缺少 awardId'), 400);

    try {
      const award = await db.userAward.findUnique({
        where: { id: awardId },
        select: { id: true, receiverId: true },
      });
      if (!award) return json(error(ErrorCodes.NOT_FOUND, '勋章记录不存在'), 404);
      if (award.receiverId !== userId) {
        return json(error(ErrorCodes.BAD_REQUEST, '勋章不属于该用户'), 400);
      }

      await db.userAward.delete({ where: { id: awardId } });
      return json(success({ deleted: true }), 200);
    } catch {
      return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
    }
  }

  // CREATE path (POST / GET with ?data=)
  const isSelfAward = userId === session.userId;
  if (isSelfAward && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '仅站长可自授勋章'), 403);
  }

  let body: { type?: string; message?: string };
  try {
    body = event.request.method === 'GET'
      ? JSON.parse(event.url.searchParams.get('data') || '{}')
      : await event.request.json();
  } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }

  const { type, message } = body;
  if (!type || !AWARD_TYPES.find(a => a.id === type)) {
    return json(error(ErrorCodes.BAD_REQUEST, '勋章类型无效'), 400);
  }
  if (message && message.length > 200) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '留言不超过 200 字'), 400);
  }

  const existing = await db.userAward.findFirst({ where: { receiverId: userId, type } });
  if (existing) return json(error(ErrorCodes.BAD_REQUEST, '已授予过该类型勋章'), 409);

  const receiver = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!receiver) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

  const awardDef = AWARD_TYPES.find(a => a.id === type)!;
  const award = await db.userAward.create({
    data: { receiverId: userId, giverId: session.userId, type, message: message?.trim() || null },
    select: { id: true, type: true },
  });

  await notify(userId, 'award_received', `获得勋章：${awardDef.labelZh}`, message ?? undefined, undefined);

  return json(success(award), 200);
}

