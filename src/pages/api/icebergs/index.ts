import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { normalizeIcebergTopic } from '../../../lib/icebergTopic';
import { can } from '../../../lib/permissions';
import { renderMarkdownWithMath } from '../../../lib/markdown';
import { normalizeSnapshot } from '../../../lib/icebergRepository';

const SLUG_RE = /^[a-zA-Z0-9_-]{2,60}$/;

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 20 && !/["\\\n\r<>{}]/.test(l))
    .slice(0, 10);
}

type SeedTierCreate = {
  name: string;
  desc: string;
  order: number;
  items: { create: { title: string; desc: string; renderedDesc?: string | null; order: number; labels: string }[] };
};

function normalizeSeedTiers(raw: unknown): SeedTierCreate[] {
  if (!Array.isArray(raw)) {
    return [
      { name: 'Tier 1', desc: '', order: 0, items: { create: [] } },
      { name: 'Tier 2', desc: '', order: 1, items: { create: [] } },
      { name: 'Tier 3', desc: '', order: 2, items: { create: [] } },
    ];
  }

  const tiers = (raw as unknown[])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .slice(0, 20)
    .map((tier, idx) => {
      const nameRaw = typeof tier.name === 'string' ? tier.name.trim() : '';
      const descRaw = typeof tier.desc === 'string' ? tier.desc : '';
      const orderRaw = typeof tier.order === 'number' && Number.isFinite(tier.order) ? tier.order : idx;
      const itemsRaw = Array.isArray(tier.items) ? tier.items : [];

      const items = itemsRaw
        .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
        .map((it, itemIdx) => {
          const title = typeof it.title === 'string' ? it.title.trim() : '';
          if (!title) return null;
          const desc = typeof it.desc === 'string' ? it.desc : '';
          const itemOrder = typeof it.order === 'number' && Number.isFinite(it.order) ? it.order : itemIdx;
          return {
            title: title.slice(0, 120),
            desc,
            renderedDesc: desc ? renderMarkdownWithMath(desc) : null,
            order: itemOrder,
            labels: JSON.stringify(sanitizeLabels(it.labels)),
          };
        })
        .filter((it): it is NonNullable<typeof it> => !!it)
        .sort((a, b) => a.order - b.order)
        .map((it, orderedIdx) => ({ ...it, order: orderedIdx }));

      return {
        name: (nameRaw || `Tier ${idx + 1}`).slice(0, 80),
        desc: descRaw.slice(0, 240),
        order: orderRaw,
        items: { create: items },
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((tier, orderedIdx) => ({ ...tier, order: orderedIdx }));

  if (tiers.length > 0) return tiers;

  return [
    { name: 'Tier 1', desc: '', order: 0, items: { create: [] } },
    { name: 'Tier 2', desc: '', order: 1, items: { create: [] } },
    { name: 'Tier 3', desc: '', order: 2, items: { create: [] } },
  ];
}

// GET /api/icebergs - 获取冰山图列表
// 支持参数：page, limit, status, q（关键词搜索）, sort（newest/oldest/popular）, topic
export async function GET(event: APIContext) {
  try {
    const url = new URL(event.request.url);
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
    const requestedStatus = url.searchParams.get('status') || 'PUBLISHED';
    const q    = url.searchParams.get('q')?.trim() || '';
    const sort = url.searchParams.get('sort') || 'newest';
    const nsfw = url.searchParams.get('nsfw') || 'hide'; // 'show' | 'hide'
    const rawTopic = url.searchParams.get('topic');
    const topic = rawTopic ? normalizeIcebergTopic(rawTopic, '') : '';

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
      ...(topic ? { topic } : {}),
      ...(authorFilter ? { authorId: authorFilter } : {}),
      ...searchFilter,
      ...nsfwFilter,
    };

    const orderBy =
      sort === 'popular' ? { viewCount: 'desc' as const } :
      sort === 'oldest'  ? { createdAt: 'asc'  as const } :
                           { createdAt: 'desc' as const };

    const listSelect: any = {
      id: true,
      slug: true,
      title: true,
      description: true,
      topic: true,
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
    };

    const [icebergs, total] = await Promise.all([
      prisma.iceberg.findMany({
        where,
        select: listSelect,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.iceberg.count({ where }),
    ]);

    let responseItems: any[] = icebergs;
    if (status === 'PUBLISHED' && !authorFilter && icebergs.length > 0) {
      try {
        const publications = await (prisma as any).icebergPublication.findMany({
          where: { icebergId: { in: icebergs.map((item) => item.id) } },
        });
        const publicationMap = new Map(publications.map((publication: any) => [
          publication.icebergId,
          publication,
        ]));
        responseItems = icebergs.map((item: any) => {
          const publication: any = publicationMap.get(item.id);
          const snapshot = normalizeSnapshot(publication?.snapshot);
          if (!publication || !snapshot) return item;
          return {
            ...item,
            title: publication.title,
            description: publication.description,
            topic: publication.topic,
            _count: { tiers: snapshot.tiers.length },
            tiers: snapshot.tiers.slice(0, 1).map((tier) => ({
              items: tier.items.slice(0, 3).map((entry) => ({ title: entry.title })),
            })),
            _publicationSearchText: publication.searchText || '',
            _publicationHasNsfw: snapshot.tiers.some((tier) =>
              tier.items.some((entry) => entry.labels.some((label) => label.toLowerCase() === 'nsfw'))),
          };
        }).filter((item: any) => {
          if (q && item._publicationSearchText
            && !item._publicationSearchText.toLowerCase().includes(q.toLowerCase())) return false;
          if (topic && item.topic !== topic) return false;
          if (nsfw !== 'show' && item._publicationHasNsfw) return false;
          return true;
        }).map(({ _publicationSearchText, _publicationHasNsfw, ...item }: any) => item);
      } catch {
        // 迁移尚未完成时继续返回旧列表，功能开关可保持关闭。
      }
    }

    return new Response(
      JSON.stringify(
        success({
          items: responseItems,
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
export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!can(session, 'content:create')) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '账户受限，无法创建冰山图')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const title = (body.title || '').trim();
    if (!title) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = (body.slug as string | undefined)?.trim();
    if (!slug || !SLUG_RE.test(slug)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, 'ID 需为 2-60 位字母、数字、连字符或下划线')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await prisma.iceberg.findFirst({ where: { OR: [{ id: slug }, { slug }] } });
    if (existing) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '该 ID 已被使用，请换一个')), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    }

    const topic = normalizeIcebergTopic(body.topic);
    const authorId = session.userId;

    const descRaw = body.description || '';
    const createData: any = {
      id: slug,
      slug,
      title,
      description: descRaw,
      renderedDescription: descRaw ? renderMarkdownWithMath(descRaw) : null,
      topic,
      status: 'DRAFT',
      authorId,
      tiers: {
        create: normalizeSeedTiers(body.tiers),
      },
    };

    const iceberg = await prisma.iceberg.create({
      data: createData,
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
      },
    });

    return new Response(JSON.stringify(success(iceberg)), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '创建失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
