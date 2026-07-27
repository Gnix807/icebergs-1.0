import type { APIContext } from 'astro';
import { error, ErrorCodes, success } from '../../../lib/api';
import { getSession } from '../../../lib/auth';
import { extractIcebergThreadsId, parseIcebergThreads } from '../../../lib/icebergImporter';

const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/iceberg-charts/databases/(default)/documents/icebergs/';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARS = 12_000_000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const fetchLog = new Map<string, number[]>();

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = ErrorCodes.INTERNAL_ERROR,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function allowFetch(userId: string): boolean {
  const now = Date.now();
  const recent = (fetchLog.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    fetchLog.set(userId, recent);
    return false;
  }
  fetchLog.set(userId, [...recent, now]);
  return true;
}

async function fetchDocument(docId: string): Promise<{ fields: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(FIRESTORE_BASE + encodeURIComponent(docId), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (upstream.status === 404) {
      throw new UpstreamError('源站冰山图不存在，请检查链接', 404, ErrorCodes.NOT_FOUND);
    }
    if (!upstream.ok) {
      throw new UpstreamError(`源站暂时无法访问（HTTP ${upstream.status}）`, 502);
    }

    const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_RESPONSE_CHARS) {
      throw new UpstreamError('源站冰山图数据过大，暂时无法导入', 413, ErrorCodes.VALIDATION_ERROR);
    }
    const raw = await upstream.text();
    if (raw.length > MAX_RESPONSE_CHARS) {
      throw new UpstreamError('源站冰山图数据过大，暂时无法导入', 413, ErrorCodes.VALIDATION_ERROR);
    }

    const document = JSON.parse(raw) as { fields?: Record<string, unknown> };
    if (!document.fields || typeof document.fields !== 'object') {
      throw new UpstreamError('源站返回的数据格式异常', 502, ErrorCodes.VALIDATION_ERROR);
    }
    return { fields: document.fields };
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error('获取 Iceberg Threads 数据失败:', timedOut ? 'timeout' : err);
    throw new UpstreamError(
      timedOut ? '连接源站超时，请稍后重试' : '服务器暂时无法连接源站',
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// 保留原有 POST / GET?data= 导入协议，同时为新同步页提供 GET?id= 的同源原始数据代理。
export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录后再导入或同步'), 401);
  if (!allowFetch(session.userId)) {
    return json(error(ErrorCodes.RATE_LIMITED, '获取过于频繁，请几分钟后再试'), 429);
  }

  try {
    const rawDocId = event.url.searchParams.get('id')?.trim() ?? '';
    if (rawDocId) {
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(rawDocId)) {
        return json(error(ErrorCodes.VALIDATION_ERROR, 'Iceberg Threads 链接无效'), 400);
      }
      return json(success(await fetchDocument(rawDocId)));
    }

    let body: { url?: string; maxItems?: number };
    try {
      body = event.request.method === 'GET'
        ? JSON.parse(event.url.searchParams.get('data') || '{}')
        : await event.request.json();
    } catch {
      return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400);
    }

    const sourceUrl = body.url?.trim();
    if (!sourceUrl) return json(error(ErrorCodes.BAD_REQUEST, '请输入 icebergthreads 链接'), 400);
    const docId = extractIcebergThreadsId(sourceUrl);
    if (!docId) {
      return json(error(
        ErrorCodes.BAD_REQUEST,
        '无法识别此链接，请提供 icebergthreads.com 的冰山图链接',
      ), 400);
    }

    const document = await fetchDocument(docId);
    const maxItems = Number.isFinite(body.maxItems)
      ? Math.min(500, Math.max(1, Math.floor(body.maxItems!)))
      : 200;
    return json(success(parseIcebergThreads(document.fields as any, {
      maxItemsPerLayer: maxItems,
    })));
  } catch (err) {
    if (err instanceof UpstreamError) {
      return json(error(err.code, err.message), err.status);
    }
    console.error('导入 Iceberg Threads 数据失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '导入失败，请稍后重试'), 500);
  }
}
