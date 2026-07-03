import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = event.params;
  let body: { icebergId?: string; note?: string };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.icebergId) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 icebergId')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const col = await prisma.collection.findUnique({ where: { id: id! } });
    if (!col || col.userId !== session.userId) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权限')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const maxOrder = await prisma.collectionItem.aggregate({
      where: { collectionId: id! }, _max: { sortOrder: true },
    });
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const item = await prisma.collectionItem.create({
      data: {
        collectionId: id!,
        icebergId: body.icebergId,
        sortOrder: nextOrder,
        note: body.note || null,
      },
    });
    return new Response(JSON.stringify(success({ item })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return new Response(JSON.stringify(error(ErrorCodes.CONFLICT, '已在该收藏集中')), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('添加收藏失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '添加失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = event.params;
  let body: { icebergId?: string };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.icebergId) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 icebergId')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const col = await prisma.collection.findUnique({ where: { id: id! } });
    if (!col || col.userId !== session.userId) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权限')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.collectionItem.deleteMany({
      where: { collectionId: id!, icebergId: body.icebergId },
    });
    return new Response(JSON.stringify(success({ removed: true })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('移除收藏失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '移除失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
