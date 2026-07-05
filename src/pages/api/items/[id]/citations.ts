import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const { id } = event.params;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);
  try {
    const citations = await prisma.citation.findMany({ where: { itemId: id }, orderBy: { order: 'asc' } });
    return json(success({ citations }), 200);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '加载失败'), 500); }
}

export async function POST(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  try {
    let body: { text?: string; url?: string };
    try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const text = (body.text ?? '').trim();
    if (!text || text.length > 500) return json(error(ErrorCodes.BAD_REQUEST, '引用文字 1-500 字'), 400);
    const count = await prisma.citation.count({ where: { itemId: id } });
    const citation = await prisma.citation.create({
      data: { itemId: id, text, url: body.url?.trim() || null, order: count },
      select: { id: true, text: true, url: true, order: true },
    });
    return json(success({ citation }), 201);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '添加失败'), 500); }
}

export async function DELETE(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  try {
    const cid = new URL(event.request.url).searchParams.get('cid');
    if (!cid) return json(error(ErrorCodes.BAD_REQUEST, '缺少引用 ID'), 400);
    await prisma.citation.delete({ where: { id: cid } });
    return json(success({ deleted: true }), 200);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500); }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
