import type { APIContext } from 'astro';
import { prisma } from '../../lib/prisma';
import { success, error, ErrorCodes } from '../../lib/api';
import { getSession } from '../../lib/auth/index';
import { checkAchievements, updateDailyStreak } from '../../lib/achievementService';
import { isRateLimited } from '../../lib/rateLimit';

const MAX_QUERY_LEN = 200;
const DEFAULT_LIMIT = 20;

export async function GET(event: APIContext) {
  const q = (event.url.searchParams.get('q') || '').trim().slice(0, MAX_QUERY_LEN);
  const cursor = event.url.searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(event.url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 50);

  if (q.length < 2) {
    return new Response(JSON.stringify(success({ items: [], cursor: null })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await getSession(event);
  const rateKey = session?.userId || event.clientAddress || 'anonymous';
  if (await isRateLimited('search', rateKey, 60)) {
    return new Response(JSON.stringify(error(ErrorCodes.RATE_LIMITED, '搜索太频繁，请稍后再试')), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 构建 tsquery：
    // - 空格分词（英文）各词用 & 连接
    // - CJK 文本额外拆成单字，用 | 连接
    // - 最终：(英文词) & (CJK字1 | CJK字2 | ... | 原词)
    const buildTsquery = (input: string): string => {
      const parts = input.split(/\s+/).filter(Boolean);
      const terms: string[] = [];
      for (const part of parts) {
        const chars = part.match(/[\u4e00-\u9fff]/g);
        if (chars && chars.length > 0) {
          // CJK 文本：原词 + 单字都用 | 连接
          const charTerms = [...new Set(chars)].map(c => c).join(' | ');
          terms.push(`(${charTerms} | ${part})`);
        } else {
          terms.push(`${part}:*`);
        }
      }
      return terms.join(' & ');
    };
    const terms = buildTsquery(q);
    if (!terms) {
      return new Response(JSON.stringify(success({ items: [], users: [], cursor: null })), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const conditions: string[] = [`ice."search_vector" @@ to_tsquery('simple', '${terms.replace(/'/g, "''")}')`];
    if (cursor) {
      conditions.push(`ice."id" < '${cursor}'`);
    }

    let icebergs: any[] = [];
    // 已启用版本控制的冰山图只搜索最后一次审核通过的 Publication，
    // 避免 main 主草稿中的未审核标题或词条泄露到公开搜索。
    try {
      const publications = await (prisma as any).icebergPublication.findMany({
        where: {
          searchText: { contains: q, mode: 'insensitive' },
          iceberg: {
            status: 'PUBLISHED',
            ...(cursor ? { id: { lt: cursor } } : {}),
          },
        },
        include: {
          iceberg: { select: { id: true, slug: true, viewCount: true } },
        },
        take: limit,
        orderBy: { publishedAt: 'desc' },
      });
      icebergs = publications.map((publication: any) => ({
        id: publication.iceberg.id,
        slug: publication.iceberg.slug,
        title: publication.title,
        description: publication.description,
        _count: {
          tiers: Array.isArray(publication.snapshot?.tiers)
            ? publication.snapshot.tiers.length
            : 0,
        },
      }));
    } catch {
      // Publication 表尚未完成迁移时，下面的旧数据回退仍可提供搜索。
    }

    // 尚未初始化版本库的旧内容继续使用现有搜索向量，完成回填后会自然退出该路径。
    if (icebergs.length < limit) {
      const remaining = limit - icebergs.length;
      const existingIds = icebergs.map((item) => item.id);
      const legacy = await prisma.iceberg.findMany({
        where: {
          status: 'PUBLISHED',
          repositoryInitializedAt: null,
          id: {
            notIn: existingIds,
            ...(cursor ? { lt: cursor } : {}),
          },
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            {
              tiers: {
                some: {
                  items: {
                    some: {
                      OR: [
                        { title: { contains: q } },
                        { desc: { contains: q } },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          _count: { select: { tiers: true } },
        },
        take: remaining,
        orderBy: { viewCount: 'desc' },
      });
      icebergs.push(...legacy);
    }

    const allResults = icebergs.slice(0, limit);
    const nextCursor = allResults.length === limit ? allResults[allResults.length - 1].id : null;

    // 同时搜索用户
    let users: any[] = [];
    try {
      users = await prisma.user.findMany({
        where: {
          status: { notIn: ['PERM_BANNED'] },
          OR: [
            { username: { contains: q } },
            { nickname: { contains: q } },
          ],
        },
        select: { id: true, username: true, nickname: true, avatar: true },
        take: 5,
        orderBy: { createdAt: 'asc' },
      });
    } catch {}


    // 搜索统计更新（仅登录用户，异步不阻塞）
    const session = await getSession(event);
    if (session) {
      Promise.all([
        updateDailyStreak(session.userId),
        prisma.userStats.upsert({
          where: { userId: session.userId },
          create: { userId: session.userId, searchCount: 1 },
          update: { searchCount: { increment: 1 } },
        }),
        checkAchievements(session.userId, { type: 'search' }),
      ]).catch(() => {});
    }

    const items = allResults.map((i: any) => ({
      id: i.id,
      slug: i.slug,
      title: i.title,
      description: i.description,
      _count: i._count || { tiers: 0 },
    }));

    return new Response(JSON.stringify(success({ items, users, cursor: nextCursor })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('搜索失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '搜索服务暂不可用')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
