import type { APIContext } from 'astro';
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

function matchHeader(buf: Buffer, header: number[], offset = 0): boolean {
  if (buf.length < offset + header.length) return false;
  for (let i = 0; i < header.length; i += 1) {
    if (buf[offset + i] !== header[i]) return false;
  }
  return true;
}

function isMagicNumberValid(buf: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return matchHeader(buf, [0xff, 0xd8, 0xff]);
  if (mime === 'image/png') return matchHeader(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/gif') {
    return matchHeader(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || matchHeader(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  }
  if (mime === 'image/webp') {
    return matchHeader(buf, [0x52, 0x49, 0x46, 0x46]) && matchHeader(buf, [0x57, 0x45, 0x42, 0x50], 8);
  }
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function ALL(event: APIContext) {
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

  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
  } catch {
    return json(error(ErrorCodes.BAD_REQUEST, '文件读取失败，请重试上传'), 400);
  }
  if (!isMagicNumberValid(buf, file.type)) {
    return json(error(ErrorCodes.BAD_REQUEST, '文件内容与格式不匹配，请重新选择图片'), 400);
  }

  const ext = EXT_MAP[file.type];
  if (!ext) return json(error(ErrorCodes.BAD_REQUEST, '不支持的图片格式'), 400);

  const filename = `${session.userId}_${Date.now()}.${ext}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');

  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buf);
  } catch {
    return json(error(ErrorCodes.INTERNAL_ERROR, '文件保存失败，请稍后再试'), 500);
  }

  const url = `/uploads/avatars/${filename}`;
  await prisma.user.update({ where: { id: session.userId }, data: { avatar: url } });

  return json(success({ url }), 200);
}

