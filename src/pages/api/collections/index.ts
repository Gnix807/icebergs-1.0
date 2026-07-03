import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth/index';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const collections = await prisma.collection.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, description: true, isPublic: true, createdAt: true, updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return new Response(JSON.stringify(success({ collections })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取收藏集失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { name?: string; description?: string; isPublic?: boolean };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = (body.name || '').trim();
  if (!name || name.length < 1 || name.length > 50) {
    return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '名称需 1-50 字')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const collection = await prisma.collection.create({
      data: {
        name,
        description: (body.description || '').trim() || null,
        isPublic: body.isPublic ?? false,
        userId: session.userId,
      },
    });

    return new Response(JSON.stringify(success({ collection })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建收藏集失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '创建失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
