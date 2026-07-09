/**
 * POST /api/import/icebergthreads
 *
 * 从 icebergthreads.com 链接导入冰山图。
 * Body: { url: string, maxItems?: number }
 * Returns: 解析后的冰山图结构
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth';
import { extractIcebergThreadsId, fetchIcebergThreads, parseIcebergThreads } from '../../../lib/icebergImporter';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { url?: string; maxItems?: number };
  try {
    body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json();
  } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = body.url?.trim();
  if (!url) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请输入 icebergthreads 链接')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const docId = extractIcebergThreadsId(url);
  if (!docId) {
    return new Response(JSON.stringify(error(
      ErrorCodes.BAD_REQUEST,
      '无法识别此链接，请提供 icebergthreads.com 的冰山图链接',
    )), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawFields = await fetchIcebergThreads(docId);
    const result = parseIcebergThreads(rawFields, {
      maxItemsPerLayer: body.maxItems ?? 200,
    });

    return new Response(JSON.stringify(success(result)), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('导入冰山图失败:', err);
    return new Response(JSON.stringify(error(
      ErrorCodes.INTERNAL_ERROR,
      err instanceof Error ? err.message : '导入失败，请检查链接是否正确',
    )), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
