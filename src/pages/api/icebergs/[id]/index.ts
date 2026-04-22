import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';

// GET /api/icebergs/:id - 获取冰山图详情
export async function GET(event: APIEvent) {
  try {
    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 优先用 slug 查，再用 id 查
    const iceberg = await prisma.iceberg.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          include: {
            items: true,
          },
        },
        author: {
          select: { id: true, username: true, nickname: true },
        },
      },
    });

    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 追踪 visitedIcebergCount（首次访问该图）
    const session = await getSession(event);
    if (session) {
      const alreadyRead = await prisma.itemRead.findFirst({
        where: { userId: session.userId, icebergId: iceberg.id },
      });
      if (!alreadyRead) {
        await updateDailyStreak(session.userId);
        await prisma.userStats.upsert({
          where: { userId: session.userId },
          create: { userId: session.userId, visitedIcebergCount: 1 },
          update: { visitedIcebergCount: { increment: 1 } },
        });
        checkAchievements(session.userId, {
          type: 'visit',
          currentIceberg: { id: iceberg.id, tierCount: 0, itemCount: 0 },
          isFirstVisitIceberg: true,
        });
      }
    }

    // Parse labels from JSON string to array for the editor
    const processed = {
      ...iceberg,
      tiers: iceberg.tiers.map((t: any) => ({
        ...t,
        items: t.items.map((i: any) => ({
          ...i,
          labels: (() => { try { return JSON.parse(i.labels || '[]'); } catch { return []; } })(),
        })),
      })),
    };

    return new Response(JSON.stringify(success(processed)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// PUT /api/icebergs/:id - 更新冰山图
export async function PUT(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json();
    const { title, description, status } = body;

    // 检查冰山图是否存在且属于当前用户
    const existing = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!existing) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (existing.authorId !== session.userId) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateData: { title?: string; description?: string; status?: string } = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    const iceberg = await prisma.iceberg.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
        author: {
          select: { id: true, username: true, nickname: true },
        },
      },
    });

    return new Response(JSON.stringify(success(iceberg)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// DELETE /api/icebergs/:id - 删除冰山图
export async function DELETE(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 检查冰山图是否存在且属于当前用户
    const existing = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!existing) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isOwner = existing.authorId === session.userId;
    const isAdmin = session.role === 'ADMIN' || session.role === 'EDITOR';
    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 删除冰山图（级联删除 tiers 和 items）
    await prisma.iceberg.delete({
      where: { id: existing.id },
    });

    return new Response(JSON.stringify(success({ deleted: true })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('删除冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '删除失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
