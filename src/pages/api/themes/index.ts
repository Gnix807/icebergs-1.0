/**
 * GET  /api/themes       — 列出所有公开主题
 * POST /api/themes       — 创建新主题
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth';

export async function GET(event: APIContext) {
  try {
    const themes = await prisma.theme.findMany({
      where: { isPublic: true },
      orderBy: [{ isPreset: 'desc' }, { downloads: 'desc' }],
      select: {
        id: true, name: true, description: true, isPreset: true,
        downloads: true, variables: true, createdAt: true,
        author: { select: { id: true, username: true, nickname: true } },
      },
    });
    return new Response(JSON.stringify(success(themes)), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取主题列表失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
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

  let body: { name?: string; description?: string; variables?: string; isPublic?: boolean };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.name?.trim()) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '主题名称不能为空')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const theme = await prisma.theme.create({
      data: {
        name: body.name.trim(),
        description: body.description || '',
        authorId: session.userId,
        isPublic: body.isPublic !== false,
        variables: body.variables || '{}',
      },
      select: { id: true, name: true },
    });
    return new Response(JSON.stringify(success(theme)), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建主题失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '创建失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
