import { prisma } from './prisma';

/**
 * Legacy RfA/promotion/election/impeachment writes are disabled by default.
 * The switch exists only as a short-lived production rollback lever.
 */
export async function legacyGovernanceWritesEnabled(): Promise<boolean> {
  if (process.env.LEGACY_GOVERNANCE_WRITE_ENABLED === 'true') return true;
  if (process.env.LEGACY_GOVERNANCE_WRITE_ENABLED === 'false') return false;
  try {
    const setting = await prisma.systemSettings.findUnique({
      where: { key: 'feature_legacy_governance_write' },
      select: { value: true },
    });
    return setting?.value === 'true';
  } catch {
    return false;
  }
}
