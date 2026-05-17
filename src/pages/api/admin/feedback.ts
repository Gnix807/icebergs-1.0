import type { APIContext } from 'astro';
import { getSession } from '../../../lib/auth/index';
import { prisma } from '../../../lib/prisma';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session || (session.role !== 'EDITOR' && session.role !== 'ADMIN')) {
    return new Response(
      JSON.stringify({ success: false, error: { message: '无权限' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const feedbacks = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return new Response(
    JSON.stringify({ success: true, data: feedbacks }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

