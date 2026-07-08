import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { renderMarkdownWithMath } from '../../../../lib/markdown';

export async function GET(event: APIContext) {
  try {
    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: { desc: true, renderedDesc: true },
    });

    if (!item) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '词条不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const descHtml = item.renderedDesc
      || (item.desc ? renderMarkdownWithMath(item.desc) : null);

    return new Response(JSON.stringify(success({
      descHtml: descHtml || '',
      cached: !!item.renderedDesc,
    })), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('获取词条描述失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
