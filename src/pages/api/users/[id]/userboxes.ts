import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { USERBOX_LIBRARY } from '../../../../lib/awards';

const ALL_BOX_IDS = new Set(USERBOX_LIBRARY.flatMap(c => c.boxes.map(b => b.id)));

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(event: APIEvent) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.userId !== event.params.id) return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);

  let body: { ids?: unknown };
  try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }

  if (!Array.isArray(body.ids)) return json(error(ErrorCodes.BAD_REQUEST, 'ids 必须是数组'), 400);

  const ids = (body.ids as unknown[])
    .filter((x): x is string => typeof x === 'string' && ALL_BOX_IDS.has(x))
    .slice(0, 20);

  await prisma.user.update({
    where: { id: session.userId },
    data: { userboxIds: JSON.stringify(ids) },
  });

  return json(success({ ids }), 200);
}
