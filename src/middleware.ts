import { defineMiddleware } from 'astro:middleware';

const rateMap = new Map<string, number[]>();
const CLEAN_INTERVAL = 60_000;
const MAX_REQUESTS = 60;

setInterval(() => {
  const cutoff = Date.now() - CLEAN_INTERVAL;
  for (const [key, timestamps] of rateMap) {
    const valid = timestamps.filter(t => t > cutoff);
    if (valid.length === 0) rateMap.delete(key);
    else rateMap.set(key, valid);
  }
}, CLEAN_INTERVAL);

export const onRequest = defineMiddleware((context, next) => {
  const ip = context.clientAddress ?? context.request.headers.get('x-forwarded-for') ?? 'unknown';
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
    return new Response('请求过于频繁，请稍后再试', {
      status: 429,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return next();
});
