import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth/index';
import { prisma } from '../../../lib/prisma';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: { icebergId?: string | null; data?: string };
    try { body = JSON.parse(dataParam || '{}') } catch {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!body.data) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 data')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedIcebergId = body.icebergId || null;

    try {
      const draft = await prisma.draft.upsert({
        where: { userId_icebergId: { userId: session.userId, icebergId: resolvedIcebergId! } },
        create: { userId: session.userId, icebergId: resolvedIcebergId, data: body.data },
        update: { data: body.data },
      });

      return new Response(JSON.stringify(success({ draft })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('保存草稿失败:', err);
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '保存失败')), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

  }

  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const icebergId = event.url.searchParams.get('icebergId');
  const resolvedIcebergId = icebergId === 'null' || icebergId === '' ? null : icebergId;

  try {
    const draft = await prisma.draft.findUnique({
      where: { userId_icebergId: { userId: session.userId, icebergId: resolvedIcebergId! } },
    });

    return new Response(JSON.stringify(success({ draft })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('加载草稿失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

