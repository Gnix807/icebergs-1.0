import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';
import { can } from '../../../../lib/permissions';
import { hasCapability } from '../../../../lib/capabilities';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isTrustedLegacyMutation(event: APIContext): boolean {
  return event.request.headers.get('x-requested-with') === 'XMLHttpRequest'
    || event.request.headers.get('sec-fetch-site') === 'same-origin';
}

async function deleteIdea(event: APIContext, legacyGet = false): Promise<Response> {
  try {
    if (legacyGet && !isTrustedLegacyMutation(event)) {
      return json(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求'), 403);
    }

    const origin = event.request.headers.get('origin');
    if (origin && origin !== event.url.origin) {
      return json(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求'), 403);
    }

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const existing = await prisma.idea.findUnique({
      where: { id },
      select: { creatorId: true },
    });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '创意不存在'), 404);

    const canModerate = hasCapability(session, 'COMMUNITY_MODERATION');
    const canDeleteOwn = existing.creatorId === session.userId
      && can(session, 'content:edit:own');
    if (!canModerate && !canDeleteOwn) {
      return json(error(ErrorCodes.FORBIDDEN, '只有创建者或社区管理人员可以删除创意'), 403);
    }

    // Votes, claimants and comments cascade in the database. Keep ownership
    // in the final predicate so a concurrent permission change cannot turn
    // this into an unauthorized delete.
    const deleted = await prisma.idea.deleteMany({
      where: canModerate
        ? { id }
        : { id, creatorId: session.userId },
    });
    if (deleted.count === 0) {
      const latest = await prisma.idea.findUnique({
        where: { id },
        select: { creatorId: true },
      });
      if (!latest) return json(error(ErrorCodes.NOT_FOUND, '创意不存在'), 404);
      return json(error(ErrorCodes.FORBIDDEN, '权限已变化，请刷新后重试'), 403);
    }

    return json(success({ deleted: true }), 200);
  } catch (err) {
    console.error('删除创意失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
  }
}

export async function GET(event: APIContext) {
  if (event.url.searchParams.get('action') === 'delete') {
    return deleteIdea(event, true);
  }

  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    const { id } = event.params;
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const idea = await prisma.idea.findUnique({ where: { id } });
      if (!idea) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '创意不存在')), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }

      let body: { status?: string; claimedBy?: string; icebergId?: string; title?: string; description?: string };
      try { body = JSON.parse(dataParam || '{}') } catch {
        return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // 认领：任何登录用户都可以认领 OPEN 状态的创意（包括创建者自己）
      if (body.status === 'CLAIMED' && idea.status === 'OPEN') {
        if (idea.claimedBy && idea.claimedBy !== session.userId) {
          return new Response(JSON.stringify(error(ErrorCodes.CONFLICT, '已被其他人认领')), {
            status: 409, headers: { 'Content-Type': 'application/json' },
          });
        }
        const updated = await prisma.idea.update({
          where: { id },
          data: { status: 'CLAIMED', claimedBy: session.userId },
          select: { id: true, title: true, status: true, claimedBy: true, icebergId: true, creator: { select: { id: true, username: true, nickname: true, avatar: true } } },
        });
        return new Response(JSON.stringify(success({ idea: updated })), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // 只有创建者、认领者或具备社区管理能力的用户可以执行其余修改操作。
      const isOwner = idea.creatorId === session.userId;
      const isClaimant = idea.claimedBy === session.userId;
      const canModerate = hasCapability(session, 'COMMUNITY_MODERATION');
      if (!isOwner && !isClaimant && !canModerate) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权限')), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        });
      }

      const data: any = {};
      // 创建者可以编辑标题和描述
      if (isOwner) {
        if (typeof body.title === 'string' && body.title.trim().length >= 2) data.title = body.title.trim();
        if (typeof body.description === 'string') data.description = body.description.trim();
      }
      if (body.status && ['OPEN', 'CLAIMED', 'COMPLETED'].includes(body.status)) {
        data.status = body.status;
      }
      if (body.claimedBy !== undefined) data.claimedBy = body.claimedBy || null;
      if (body.icebergId !== undefined) data.icebergId = body.icebergId || null;

      const updated = await prisma.idea.update({
        where: { id },
        data,
        select: {
          id: true, title: true, status: true, claimedBy: true, icebergId: true,
          creator: { select: { id: true, username: true, nickname: true, avatar: true } },
        },
      });

      return new Response(JSON.stringify(success({ idea: updated })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('更新创意失败:', err);
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

  }

  const { id } = event.params;
  if (!id) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const idea = await prisma.idea.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, topic: true,
        status: true, claimedBy: true, icebergId: true, createdAt: true,
        _count: { select: { votes: true } },
        creator: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });

    if (!idea) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '创意不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(success({ idea })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取创意详情失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '加载失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(event: APIContext) {
  return deleteIdea(event);
}
