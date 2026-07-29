import type { APIContext } from 'astro';
import { error, ErrorCodes } from '../../../../lib/api';

// POST (原) 和 GET 都能重置
export async function ALL(event: APIContext) {
  return new Response(JSON.stringify(error(
    ErrorCodes.LEGACY_GOVERNANCE_RETIRED,
    '永久成就不再支持全量重置；如需修正规则，请将定义标记为旧版',
  )), { status: 409, headers: { 'Content-Type': 'application/json' } });
}
