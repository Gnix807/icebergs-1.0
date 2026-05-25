import type { APIContext } from 'astro';
import { getFeatureFlags } from '../../lib/features';
import { success } from '../../lib/api';

export async function GET(_ctx: APIContext) {
  const flags = await getFeatureFlags();
  return success(flags);
}
