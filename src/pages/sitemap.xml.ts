import type { APIRoute } from 'astro';
import { prisma } from '../lib/prisma';

export const GET: APIRoute = async () => {
  const SITE = 'https://icebergs.gnix807.cn';

  const icebergs = await prisma.iceberg.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/iceberg/list', priority: '0.9', changefreq: 'daily' },
    { loc: '/topic', priority: '0.8', changefreq: 'weekly' },
    { loc: '/leaderboard', priority: '0.8', changefreq: 'daily' },
    { loc: '/featured', priority: '0.8', changefreq: 'weekly' },
    { loc: '/guide', priority: '0.6', changefreq: 'monthly' },
    { loc: '/guide/writing', priority: '0.6', changefreq: 'monthly' },
    { loc: '/about', priority: '0.5', changefreq: 'monthly' },
    { loc: '/rules', priority: '0.5', changefreq: 'monthly' },
    { loc: '/support', priority: '0.5', changefreq: 'monthly' },
    { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
    { loc: '/feedback', priority: '0.5', changefreq: 'weekly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${SITE}${p.loc}</loc>
    <priority>${p.priority}</priority>
    <changefreq>${p.changefreq}</changefreq>
  </url>`).join('\n')}
${icebergs.map(i => `  <url>
    <loc>${SITE}/iceberg/${i.slug}</loc>
    <lastmod>${new Date(i.updatedAt).toISOString().split('T')[0]}</lastmod>
    <priority>0.7</priority>
    <changefreq>weekly</changefreq>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=7200',
    },
  });
};
