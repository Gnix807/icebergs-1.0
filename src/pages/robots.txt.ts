import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return new Response(
    `User-agent: *
Allow: /
Sitemap: https://icebergs.gnix807.cn/sitemap.xml`,
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    }
  );
};
