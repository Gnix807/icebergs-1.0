import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = event.params;
  if (!id) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const col = await prisma.collection.findUnique({ where: { id } });
    if (!col || col.userId !== session.userId) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权限')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (event.request.method === 'DELETE') {
      await prisma.collection.delete({ where: { id: id! } });
      return new Response(JSON.stringify(success({ deleted: true })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: any;
    try { body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json(); } catch {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data: any = {};
    if (body.name !== undefined) data.name = (body.name || '').trim();
    if (body.description !== undefined) data.description = (body.description || '').trim() || null;
    if (body.isPublic !== undefined) data.isPublic = body.isPublic;

    const updated = await prisma.collection.update({ where: { id }, data });
    return new Response(JSON.stringify(success({ collection: updated })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新收藏集失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
