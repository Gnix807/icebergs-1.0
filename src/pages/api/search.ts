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
    try {
      icebergs = await prisma.$queryRawUnsafe(
        `SELECT ice."id", ice."slug", ice."title", ice."description",
                ts_rank(ice."search_vector", to_tsquery('simple', $1)) AS rank
         FROM "icebergs" ice
         WHERE ice."status" = 'PUBLISHED' AND ice."search_vector" @@ to_tsquery('simple', $1)
         ${cursor ? `AND ice."id" < $2` : ''}
         ORDER BY rank DESC
         LIMIT ${limit}`,
        cursor ? [terms, cursor] : [terms],
      ) as any[];
    } catch (ftsErr) {
      // tsvector 查询失败时回退到 LIKE
      icebergs = await prisma.iceberg.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
          ],
        },
        select: {
          id: true, slug: true, title: true, description: true,
          _count: { select: { tiers: true } },
        },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { viewCount: 'desc' },
      }) as any[];
    }

    // 也搜索词条内容
    let itemIcebergIds: string[] = [];
    try {
      const matchingItems = await prisma.item.findMany({
        where: {
          tier: { iceberg: { status: 'PUBLISHED' } },
          OR: [
            { title: { contains: q } },
            { desc: { contains: q } },
          ],
        },
        select: { tier: { select: { icebergId: true } } },
        take: limit,
        distinct: ['tierId'],
      });
      itemIcebergIds = [...new Set(matchingItems.map(i => i.tier.icebergId))];
    } catch {}

    // 合并结果：FTS 结果 + item 匹配结果的 iceberg，去重
    const icebergIdSet = new Set(icebergs.map(i => i.id));
    let extraIcebergs: any[] = [];
    if (itemIcebergIds.length > 0) {
      const newIds = itemIcebergIds.filter(id => !icebergIdSet.has(id));
      if (newIds.length > 0) {
        extraIcebergs = await prisma.iceberg.findMany({
          where: { id: { in: newIds }, status: 'PUBLISHED' },
          select: { id: true, slug: true, title: true, description: true,
                    _count: { select: { tiers: true } } },
          take: limit - icebergs.length,
        });
      }
    }

    const allResults = [...icebergs, ...extraIcebergs].slice(0, limit);
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
        orderBy: { qualityScore: 'desc' },
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
