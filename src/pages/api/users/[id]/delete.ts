import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { hasCapability } from '../../../../lib/capabilities';

export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return new Response(JSON.stringify(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (session.userId === id) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '不能删除自己')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, isFounder: true, _count: { select: { icebergs: true } } },
    });
    if (!target) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '用户不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (target.isFounder) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无法删除创始人')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.iceberg.deleteMany({ where: { authorId: id } });
      await tx.user.delete({ where: { id } });
    });

    return new Response(JSON.stringify(success({
      message: `已删除用户 ${target.username} 及其 ${target._count.icebergs} 个冰山图`,
      username: target.username,
      icebergsDeleted: target._count.icebergs,
    })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('删除用户失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '删除失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
