import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { hasCapability } from '../../../../lib/capabilities';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权访问')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const issues: { slug: string; title: string; issues: string[] }[] = [];

  // 1. 已发布冰山：缺少描述
  const noDesc = await prisma.iceberg.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [{ description: null }, { description: '' }],
    },
    select: { slug: true, title: true },
    take: 20,
  });
  for (const i of noDesc) {
    issues.push({ slug: i.slug, title: i.title, issues: ['缺少描述'] });
  }

  // 2. 已发布冰山：标题过短（≤3字）
  const shortTitle = await prisma.iceberg.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, title: true },
    take: 50,
  });
  for (const i of shortTitle) {
    const titleLen = [...i.title].length;
    if (titleLen <= 3) {
      const existing = issues.find(x => x.slug === i.slug);
      if (existing) { existing.issues.push(`标题过短 (${titleLen}字)`); }
      else { issues.push({ slug: i.slug, title: i.title, issues: [`标题过短 (${titleLen}字)`] }); }
    }
  }

  // 3. 已发布冰山：0词条
  const noItems = await prisma.$queryRawUnsafe<{ slug: string; title: string }[]>(`
    SELECT i.slug, i.title FROM icebergs i
    LEFT JOIN tiers t ON t."icebergId" = i.id
    LEFT JOIN items it ON it."tierId" = t.id
    WHERE i.status = 'PUBLISHED'
    GROUP BY i.id
    HAVING COUNT(it.id) = 0
    LIMIT 20
  `);
  for (const i of noItems) {
    const existing = issues.find(x => x.slug === i.slug);
    if (existing) { existing.issues.push('0个词条'); }
    else { issues.push({ slug: i.slug, title: i.title, issues: ['0个词条'] }); }
  }

  return new Response(JSON.stringify(success(issues)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
