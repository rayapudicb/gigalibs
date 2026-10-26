import { createHash } from 'node:crypto';
import {
  GENERATED_CURRENCIES,
  GENERATED_TIME_ZONES,
  type ReferenceSetKey,
  canonicalReferenceString,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import { BadRequestException, Injectable } from '@nestjs/common';

// WI-OI-120av (Phase 5A): load and serve platform reference data. A set is loaded WHOLE — its checksum re-verified
// against the canonical serialization before anything is written — the previous live version retired (never deleted),
// and the new one made live, in one transaction. `lookup` serves the live version's entries. The two sets available
// from the runtime's ICU (currencies, time zones) are generated in contracts; countries/languages/UN-ECE units plug in
// here once their dataset is sourced (the service is set-agnostic).
const GENERATED: Partial<
  Record<
    ReferenceSetKey,
    {
      setKey: ReferenceSetKey;
      source: string;
      version: string;
      checksum: string;
      entryCount: number;
      entries: readonly { code: string; name: string }[];
    }
  >
> = {
  CURRENCIES: GENERATED_CURRENCIES,
  TIME_ZONES: GENERATED_TIME_ZONES,
};

@Injectable()
export class PlatformReferenceService {
  /** The live version's entries for a set, each flattened to code + name + its set-specific payload fields. */
  async lookup(setKey: ReferenceSetKey) {
    const version = await prisma.platformReferenceVersion.findFirst({
      where: { setKey, retiredAt: null },
    });
    if (!version)
      return { setKey, provenance: null, entries: [] as Array<Record<string, unknown>> };
    const rows = await prisma.platformReferenceEntry.findMany({
      where: { versionId: version.id },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, payload: true },
    });
    return {
      setKey,
      provenance: {
        setKey,
        source: version.source,
        version: version.version,
        checksum: version.checksum,
        entryCount: version.entryCount,
        loadedAt: version.loadedAt.toISOString(),
      },
      entries: rows.map((row) => ({
        code: row.code,
        name: row.name,
        ...((row.payload as Record<string, unknown> | null) ?? {}),
      })),
    };
  }

  async listVersions(setKey?: ReferenceSetKey) {
    return prisma.platformReferenceVersion.findMany({
      where: setKey ? { setKey } : {},
      orderBy: [{ setKey: 'asc' }, { loadedAt: 'desc' }],
      select: {
        id: true,
        setKey: true,
        source: true,
        version: true,
        checksum: true,
        entryCount: true,
        loadedAt: true,
        retiredAt: true,
      },
    });
  }

  /** Load a set from its generated (ICU-authoritative) data: re-verify the checksum, retire the live version, make the
   *  new one live. Writes run as the table owner; runtime roles have SELECT only (the migration's lock). */
  async loadGeneratedSet(operatorId: string, setKey: ReferenceSetKey, reason: string) {
    const generated = GENERATED[setKey];
    if (!generated)
      throw new BadRequestException(
        `No generated data for ${setKey}; it needs a sourced dataset (ISO 3166 / ISO 639 / UN-ECE).`,
      );
    const recomputed = `sha256:${createHash('sha256')
      .update(canonicalReferenceString(generated.entries as ReadonlyArray<Record<string, unknown>>))
      .digest('hex')}`;
    if (recomputed !== generated.checksum)
      throw new BadRequestException(
        'Generated data checksum does not match; regenerate the reference data.',
      );

    return prisma.$transaction(
      async (tx) => {
        await tx.platformReferenceVersion.updateMany({
          where: { setKey, retiredAt: null },
          data: { retiredAt: new Date() },
        });
        const version = await tx.platformReferenceVersion.create({
          data: {
            setKey,
            source: generated.source,
            version: generated.version,
            checksum: generated.checksum,
            entryCount: generated.entryCount,
            reason,
            loadedById: operatorId,
          },
          select: { id: true },
        });
        await tx.platformReferenceEntry.createMany({
          data: generated.entries.map((entry) => {
            const { code, name, ...rest } = entry as { code: string; name: string } & Record<
              string,
              unknown
            >;
            return {
              versionId: version.id,
              setKey,
              code,
              name,
              payload: Object.keys(rest).length > 0 ? (rest as Prisma.InputJsonValue) : Prisma.JsonNull,
            };
          }),
        });
        await tx.auditLog.create({
          data: {
            action: 'IMPORT',
            resource: 'platform-reference',
            resourceId: version.id,
            userId: operatorId,
            after: {
              setKey,
              version: generated.version,
              checksum: generated.checksum,
              entryCount: generated.entryCount,
            },
            metadata: { reason },
          },
        });
        return { setKey, versionId: version.id, entryCount: generated.entryCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
