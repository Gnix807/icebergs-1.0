import type { APIRoute } from 'astro';
import { prisma } from '../../lib/prisma';

export const GET: APIRoute = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(JSON.stringify({ status: 'ok', db: 'connected' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', db: 'disconnected' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
