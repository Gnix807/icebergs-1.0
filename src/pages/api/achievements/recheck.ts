/**
 * POST /api/achievements/recheck
 *
 * 全量复核成就：遍历所有未解锁成就，对当前用户状态重新评估。
 * 用于解决「在成就添加之前已完成对应操作」导致的遗漏问题。
 */
import type { APIContext } from 'astro';
import { getSession } from '../../../lib/auth/index';
import { success, error, ErrorCodes } from '../../../lib/api';
import { recheckAllAchievements } from '../../../lib/achievementService';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await recheckAllAchievements(session.userId);
    return new Response(JSON.stringify(success({
      unlocked: result.length,
      achievements: result,
      message: result.length > 0
        ? `成功解锁 ${result.length} 个成就`
        : '暂无新成就可以解锁',
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('成就复核失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '复核失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
