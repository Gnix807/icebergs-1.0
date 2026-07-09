import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../lib/api';
import { getSession } from '../../lib/auth/index';
import { prisma } from '../../lib/prisma';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { type?: string; targetId?: string; reason?: string };
  try { body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.type || !body.targetId || !body.reason) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少参数')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await prisma.report.create({
      data: {
        type: body.type,
        targetId: body.targetId,
        reason: body.reason.slice(0, 50),
        filerId: session.userId,
      },
    });

    return new Response(JSON.stringify(success({ reported: true })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('举报失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '举报失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
