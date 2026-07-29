/**
 * POST /api/icebergs/[id]/transfer
 *
 * 转让冰山图所有权给另一个用户。
 * 仅作者本人可以操作；全站能力不会自动产生仓库写权限。
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { notify } from '../../../../lib/notify';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = event.params;
  if (!id) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { newAuthorId?: string };
  try {
    body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json();
  } catch {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const newAuthorId = body.newAuthorId?.trim();
  if (!newAuthorId) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请输入接收方用户 ID')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Can't transfer to yourself
  if (newAuthorId === session.userId) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '不能转让给自己')), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find iceberg
  const iceberg = await prisma.iceberg.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, title: true, authorId: true },
  });

  if (!iceberg) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (iceberg.authorId !== session.userId) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '仅作者可以转让')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check new author exists
  const newAuthor = await prisma.user.findUnique({
    where: { id: newAuthorId },
    select: { id: true, nickname: true, username: true },
  });

  if (!newAuthor) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '目标用户不存在，请检查 ID 是否正确')), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Transfer ownership
  await prisma.iceberg.update({
    where: { id: iceberg.id },
    data: { authorId: newAuthorId },
  });

  // Notify new owner
  notify(
    newAuthorId,
    'iceberg_transferred',
    `你收到了一张冰山图`,
    `${session.userId === iceberg.authorId ? '' : '管理员已将'}「${iceberg.title}」转让给你。`,
  ).catch(() => {});

  return new Response(JSON.stringify(success({
    transferred: true,
    newAuthor: { id: newAuthor.id, nickname: newAuthor.nickname, username: newAuthor.username },
  })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
