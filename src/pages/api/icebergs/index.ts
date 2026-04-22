import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { logScore } from '../../../lib/scoreLog';

const SLUG_RE = /^[a-zA-Z0-9_-]{2,60}$/;

// GET /api/icebergs - 获取冰山图列表
// 支持参数：page, limit, status, q（关键词搜索）, sort（newest/oldest/popular）
export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const requestedStatus = url.searchParams.get('status') || 'PUBLISHED';
    const q    = url.searchParams.get('q')?.trim() || '';
    const sort = url.searchParams.get('sort') || 'newest';
    const nsfw = url.searchParams.get('nsfw') || 'hide'; // 'show' | 'hide'

    // 非公开状态需要登录且只能看自己的
    let status = requestedStatus;
    let authorFilter: string | undefined;
    if (requestedStatus !== 'PUBLISHED') {
      const session = await getSession(event);
      if (!session) {
        status = 'PUBLISHED';
      } else {
        authorFilter = session.userId;
      }
    }

    const searchFilter = q
      ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] }
      : {};

    // NSFW filter: by default hide icebergs that have any NSFW-labeled items
    // When viewing own drafts, always show regardless of NSFW status
    const nsfwFilter = (nsfw !== 'show' && !authorFilter) ? {
      NOT: {
        tiers: { some: { items: { some: { labels: { contains: '"NSFW"' } } } } },
      },
    } : {};

    const where = {
      status,
      ...(authorFilter ? { authorId: authorFilter } : {}),
      ...searchFilter,
      ...nsfwFilter,
    };

    const orderBy =
      sort === 'popular' ? { viewCount: 'desc' as const } :
      sort === 'oldest'  ? { createdAt: 'asc'  as const } :
                           { createdAt: 'desc' as const };

    const [icebergs, total] = await Promise.all([
      prisma.iceberg.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          viewCount: true,
          status: true,
          createdAt: true,
          author: {
            select: { id: true, username: true, nickname: true },
          },
          _count: {
            select: { tiers: true },
          },
          tiers: {
            take: 1,
            orderBy: { order: 'asc' as const },
            select: {
              items: {
                take: 3,
                orderBy: { order: 'asc' as const },
                select: { title: true },
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.iceberg.count({ where }),
    ]);

    return new Response(
      JSON.stringify(
        success({
          items: icebergs,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        })
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('获取冰山图列表失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// POST /api/icebergs - 创建冰山图
export async function POST(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json();

    const title = body.title?.trim();
    if (!title) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = (body.slug as string | undefined)?.trim();
    if (!slug || !SLUG_RE.test(slug)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, 'ID 需为 2-60 位字母、数字、连字符或下划线')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.iceberg.findFirst({ where: { OR: [{ id: slug }, { slug }] } });
    if (existing) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '该 ID 已被使用，请换一个')), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const authorId = session.userId;

    // +5 质量分
    prisma.user.update({
      where: { id: authorId },
      data: { qualityScore: { increment: 5 } },
    }).catch(() => {});
    logScore(authorId, 5, 'iceberg_created', title);

    const iceberg = await prisma.iceberg.create({
      data: {
        id: slug,
        slug,
        title,
        description: body.description || '',
        status: 'DRAFT',
        authorId,
        tiers: {
          create: [
            { name: 'Tier 1', order: 0 },
            { name: 'Tier 2', order: 1 },
            { name: 'Tier 3', order: 2 },
          ],
        },
      },
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
      },
    });

    return new Response(JSON.stringify(success(iceberg)), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '创建失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
