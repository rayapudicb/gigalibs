import { type ReferenceSetKey, ReferenceSetKeySchema } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { LOADABLE_REFERENCE_SETS, PlatformReferenceService } from './platform-reference.service.js';

// WI-OI-153 slice A (ADR-0038 §1): the platform operator's command that loads platform reference data. Each set is
// re-verified against its checksum, loaded as a new version (the old one is kept, retired) and audited; loading the
// same data again changes nothing. It writes as the table owner, so it runs with the owner's database connection —
// on UAT the owner runs it, never an agent:
//
//   node dist/platform-reference-load.js --operator <platform operator email> --reason "<why>" [--set CURRENCIES ...]

function argument(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((value, index) => {
    const next = process.argv[index + 1];
    if (value === `--${name}` && next) values.push(next);
  });
  return values;
}

async function main(): Promise<number> {
  const email = argument('operator')[0]?.trim().toLowerCase();
  const reason = argument('reason')[0]?.trim() ?? '';
  const requested = argument('set');
  if (!email || reason.length < 3 || reason.length > 500) {
    console.error(
      'Usage: --operator <platform operator email> --reason "<3 to 500 characters>" [--set <SET> ...]',
    );
    return 2;
  }
  const sets: ReferenceSetKey[] = [];
  for (const value of requested.length > 0 ? requested : LOADABLE_REFERENCE_SETS) {
    const parsed = ReferenceSetKeySchema.safeParse(value);
    if (!parsed.success || !LOADABLE_REFERENCE_SETS.includes(parsed.data)) {
      console.error(
        `${value} cannot be loaded; loadable sets: ${LOADABLE_REFERENCE_SETS.join(', ')}.`,
      );
      return 2;
    }
    sets.push(parsed.data);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const now = new Date();
  const operator = user
    ? await prisma.platformRoleAssignment.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      })
    : null;
  if (!user || !operator) {
    console.error(`${email} is not an active platform operator; nothing was loaded.`);
    return 3;
  }
  const service = new PlatformReferenceService();
  for (const setKey of sets) {
    const result = await service.loadGeneratedSet(user.id, setKey, reason);
    console.log(
      result.unchanged
        ? `${setKey}: unchanged (version ${result.versionId} already holds these ${result.entryCount} entries)`
        : `${setKey}: loaded version ${result.versionId} (${result.entryCount} entries)`,
    );
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      `Reference data load failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // No database connection was made (for example a usage error before any query).
    }
  });
