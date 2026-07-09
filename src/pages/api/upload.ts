import type { APIContext } from 'astro';
import { getSession } from '../../lib/auth/index';
import { success, error, ErrorCodes } from '../../lib/api';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const UPLOAD_DIR = 'public/uploads/items';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await event.request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请选择文件')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '仅支持 JPG/PNG/GIF/WebP')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '文件最大 2MB')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split('/')[1] || 'png';
    const filename = `${session.userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), buf);

    const url = `/uploads/items/${filename}`;
    return new Response(JSON.stringify(success({ url })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('上传失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '上传失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
