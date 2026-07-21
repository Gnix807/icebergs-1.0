import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';

export async function POST(event: APIContext) {
  try {
    const body = await event.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const type = ['error', 'bug', 'feature', 'other'].includes(body.type) ? body.type : 'bug';
    const content = (body.content || '').trim();
    const contact = (body.contact || '').trim() || null;
    const icebergId = body.icebergId || null;
    const itemName = body.itemName || null;

    if (!content) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '请填写反馈内容')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (content.length > 2000) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '反馈内容不能超过 2000 字')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const fb = await prisma.feedback.create({
      data: { type, content, contact, icebergId, itemName },
    });

    return new Response(JSON.stringify(success({ id: fb.id })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('反馈提交失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '提交失败，请稍后重试')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
