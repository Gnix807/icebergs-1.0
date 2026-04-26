import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
  'image/webp': 'webp',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(event: APIEvent) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.userId !== event.params.id) return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);

  let formData: FormData;
  try {
    formData = await event.request.formData();
  } catch {
    return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return json(error(ErrorCodes.BAD_REQUEST, '未找到文件'), 400);
  if (!ALLOWED_TYPES.has(file.type)) return json(error(ErrorCodes.BAD_REQUEST, '仅支持 JPG / PNG / GIF / WebP'), 400);
  if (file.size > MAX_SIZE) return json(error(ErrorCodes.BAD_REQUEST, '文件大小不能超过 2 MB'), 400);

  const ext      = EXT_MAP[file.type];
  const filename = `${session.userId}_${Date.now()}.${ext}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');

  try {
    await mkdir(uploadDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, filename), buf);
  } catch {
    return json(error(ErrorCodes.INTERNAL_ERROR, '文件保存失败'), 500);
  }

  const url = `/uploads/avatars/${filename}`;
  await prisma.user.update({ where: { id: session.userId }, data: { avatar: url } });

  return json(success({ url }), 200);
}
