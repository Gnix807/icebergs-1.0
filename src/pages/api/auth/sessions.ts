import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getLinkedOAuthProviders } from '../../../lib/auth/oauthIdentity';

type SessionScope = 'others' | 'all' | 'single';

// GET /api/auth/sessions
export async function GET(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const currentSessionId = event.cookies.get('session')?.value || null;
    const [sessions, user, linkedProviders] = await Promise.all([
      prisma.session.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { passwordHash: true },
      }),
      getLinkedOAuthProviders(session.userId),
    ]);

    return new Response(JSON.stringify(success({
      currentSessionId,
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: currentSessionId ? s.id === currentSessionId : false,
      })),
      authMethods: {
        email: Boolean(user?.passwordHash),
        github: linkedProviders.github,
        google: linkedProviders.google,
      },
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取会话失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取会话失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// DELETE /api/auth/sessions
// body: { scope?: 'others' | 'all' | 'single'; sessionId?: string }
export async function DELETE(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json().catch(() => ({}));
    const scope: SessionScope = body.scope === 'all' || body.scope === 'single' ? body.scope : 'others';
    const targetSessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const currentSessionId = event.cookies.get('session')?.value || null;

    if (scope === 'single' && !targetSessionId) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 sessionId')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let deletedCount = 0;
    let currentDeleted = false;

    if (scope === 'all') {
      const deleted = await prisma.session.deleteMany({ where: { userId: session.userId } });
      deletedCount = deleted.count;
      currentDeleted = true;
      event.cookies.delete('session', { path: '/' });
    } else if (scope === 'others') {
      if (!currentSessionId) {
        return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '当前会话无效，请重新登录')), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const deleted = await prisma.session.deleteMany({
        where: {
          userId: session.userId,
          NOT: { id: currentSessionId },
        },
      });
      deletedCount = deleted.count;
    } else {
      const deleted = await prisma.session.deleteMany({
        where: {
          id: targetSessionId,
          userId: session.userId,
        },
      });
      deletedCount = deleted.count;
      if (currentSessionId && targetSessionId === currentSessionId && deletedCount > 0) {
        currentDeleted = true;
        event.cookies.delete('session', { path: '/' });
      }
    }

    return new Response(JSON.stringify(success({
      deleted: deletedCount,
      currentDeleted,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('会话操作失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '会话操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

