import { defineMiddleware } from 'astro:middleware';

const rateMap = new Map<string, number[]>();
const CLEAN_INTERVAL = 60_000;
const MAX_REQUESTS = 300;

// 静态资源不受限流（开发模式大量模块请求）
const STATIC_EXT = /\.(js|css|svg|png|jpg|jpeg|gif|ico|woff2?|ttf|map|json|xml|txt)$/i;

setInterval(() => {
  const cutoff = Date.now() - CLEAN_INTERVAL;
  for (const [key, timestamps] of rateMap) {
    const valid = timestamps.filter(t => t > cutoff);
    if (valid.length === 0) rateMap.delete(key);
    else rateMap.set(key, valid);
  }
}, CLEAN_INTERVAL);

function getClientIP(context: any): string {
  const addr = context.clientAddress ?? '';
  // 仅当请求来自本机反向代理时信任 x-forwarded-for 的第一段
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') {
    const xff = context.request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
  }
  return addr || 'unknown';
}

export const onRequest = defineMiddleware(async (context, next) => {
  // 静态资源和健康检查跳过限流
  if (STATIC_EXT.test(context.url.pathname) || context.url.pathname === '/api/health') return next();

  const ip = getClientIP(context);
  const now = Date.now();
  const cutoff = now - CLEAN_INTERVAL;

  let timestamps = rateMap.get(ip);
  if (!timestamps) {
    timestamps = [];
    rateMap.set(ip, timestamps);
  }

  const valid = timestamps.filter(t => t > cutoff);
  valid.push(now);
  rateMap.set(ip, valid);

  if (valid.length > MAX_REQUESTS) {
    console.warn(`[rate-limit] ${ip} blocked (${valid.length} req/min)`);
    return new Response('请求过于频繁，请稍后再试', {
      status: 429,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const start = Date.now();
  const response = await next();
  const elapsed = Date.now() - start;

  if (elapsed > 2000 || response.status >= 500) {
    console.warn(`[slow] ${context.request.method} ${context.url.pathname} — ${response.status} ${elapsed}ms ip=${ip}`);
  }

  return response;
});
