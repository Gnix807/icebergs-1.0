/**
 * POST /api/themes/apply
 *
 * Body: { themeId: string } — 应用指定主题
 * Body: { themeId: null }  — 恢复默认主题
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { themeId?: string | null };
  try { body = await event.request.json(); } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Reset or apply theme
    await prisma.user.update({
      where: { id: session.userId },
      data: { themeId: body.themeId || null },
    });

    // Increment downloads if applying a theme
    if (body.themeId) {
      await prisma.theme.update({
        where: { id: body.themeId },
        data: { downloads: { increment: 1 } },
      }).catch(() => {});
    }

    return new Response(JSON.stringify(success({ applied: !!body.themeId })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('应用主题失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
