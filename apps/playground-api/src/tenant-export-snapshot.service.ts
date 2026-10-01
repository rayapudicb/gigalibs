import { type PrismaTransaction, prisma } from '@gigalibs/db';
import {
  type JsonValue,
  TENANT_EXPORT_INVENTORY,
  type TenantExportSection,
} from '@gigalibs/privacy-gdpr';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PayloadCryptoService, sourceEventAuthenticatedContext } from './payload-crypto.service.js';

interface ExportDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, 'asc'> | Array<Record<string, 'asc'>>;
  }): Promise<unknown[]>;
}

/** Stable order for models keyed by more than an `id`. */
const ORDER_BY: Readonly<Record<string, Array<Record<string, 'asc'>>>> = {
  OrgHierarchyEdge: [{ versionId: 'asc' }, { unitId: 'asc' }],
};

const RELATION_FILTERS: Readonly<Record<string, (tenantId: string) => Record<string, unknown>>> = {
  Tenant: (tenantId) => ({ id: tenantId }),
  User: (tenantId) => ({ memberships: { some: { tenantId } } }),
  ExternalIdentity: (tenantId) => ({ configuration: { tenantId } }),
  SubscriptionItem: (tenantId) => ({ subscription: { tenantId } }),
  InvoiceLineItem: (tenantId) => ({ invoice: { tenantId } }),
  PaymentTransaction: (tenantId) => ({ invoice: { tenantId } }),
  PurchaseOrderLine: (tenantId) => ({ purchaseOrder: { tenantId } }),
  GoodsReceiptLine: (tenantId) => ({ goodsReceipt: { tenantId } }),
  SupplierInvoiceLine: (tenantId) => ({ supplierInvoice: { tenantId } }),
  ApMatchFinding: (tenantId) => ({ matchEvaluation: { tenantId } }),
  EvidenceItem: (tenantId) => ({ evidenceBundle: { tenantId } }),
  ClientContact: (tenantId) => ({ client: { tenantId } }),
  TicketMessage: (tenantId) => ({ ticket: { tenantId } }),
  JournalLineItem: (tenantId) => ({ entry: { tenantId } }),
  FormSubmission: (tenantId) => ({ form: { tenantId } }),
  CartItem: (tenantId) => ({ cart: { tenantId } }),
  OrderItem: (tenantId) => ({ order: { tenantId } }),
  OcrExtractionJob: (tenantId) => ({ document: { tenantId } }),
  EsignRecipient: (tenantId) => ({ envelope: { tenantId } }),
  KbArticle: (tenantId) => ({ category: { tenantId } }),
  ChatMessage: (tenantId) => ({ channel: { tenantId } }),
  SagaStep: (tenantId) => ({ sagaInstance: { tenantId } }),
};

const OMIT_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  Tenant: new Set([
    'customDomainVerificationDigest',
    'customDomainChallengeExpiresAt',
    'customDomainVerificationAttempts',
    'customDomainVerificationLockedUntil',
  ]),
  User: new Set([
    'passwordHash',
    'phone',
    'phoneVerifiedAt',
    'preferences',
    'metadata',
    'lastLoginAt',
  ]),
  TenantOidcConfiguration: new Set(['clientSecretEnvelope', 'keyVersion']),
  TenantInvite: new Set(['token']),
  TenantDataExport: new Set(['storageKey']),
  MfaAssistedRecovery: new Set(['grantDigest']),
  TenantIsolationBinding: new Set(['bindingReference']),
  TenantSubdomainBinding: new Set(['verificationRef']),
  CredentialReference: new Set(['reference']),
  SourceFileImport: new Set(['storageKey']),
  ManagedDocument: new Set(['storagePath']),
  EsignEnvelope: new Set(['signedPdfPath']),
  SourceEvent: new Set(['payloadCiphertext', 'payloadIv', 'payloadAuthTag', 'payloadKeyVersion']),
};

const SECRET_FIELD =
  /(?:^|_)(?:api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|refresh[_-]?token|secret|token)(?:$|_)/i;

@Injectable()
export class TenantExportSnapshotService {
  constructor(private readonly payloadCrypto: PayloadCryptoService) {
    assertInventoryHasLoadStrategy();
  }

  /** Reads every classified tenant-owned model from one repeatable-read database snapshot. */
  async load(
    tenantId: string,
  ): Promise<{ snapshotStartedAt: Date; sections: TenantExportSection[] }> {
    return prisma.$transaction(
      async (transaction) => {
        const snapshotStartedAt = new Date();
        const sections: TenantExportSection[] = [];
        for (const inventory of TENANT_EXPORT_INVENTORY) {
          if (!inventory.disposition.startsWith('EXPORT') || !inventory.section) continue;
          const delegate = getDelegate(transaction, inventory.model);
          const where = RELATION_FILTERS[inventory.model]?.(tenantId) ?? { tenantId };
          const orderBy = ORDER_BY[inventory.model] ?? { id: 'asc' as const };
          const rows = await delegate.findMany({ where, orderBy });
          const records = rows.map((row) => this.projectRecord(inventory.model, row));
          sections.push({ name: inventory.section, records });
        }
        const tenantSection = sections.find((section) => section.name === 'tenant');
        if (tenantSection?.records.length !== 1) {
          throw new Error('TENANT_EXPORT_TENANT_NOT_FOUND');
        }

        // Include governed ConfigurationExtensionValue records in portability export
        const extensionValues = await transaction.configurationExtensionValue.findMany({
          where: { tenantId },
          orderBy: { id: 'asc' },
        });
        if (extensionValues.length > 0) {
          sections.push({
            name: 'configuration_extension_values',
            records: extensionValues.map((ev) => ({
              id: ev.id,
              ownerType: ev.ownerType,
              ownerId: ev.ownerId,
              publishedVersionId: ev.publishedVersionId,
              manifestChecksum: ev.manifestChecksum,
              valuesChecksum: ev.valuesChecksum,
              version: ev.version,
              values: JSON.stringify(ev.values),
              createdAt: ev.createdAt.toISOString(),
              updatedAt: ev.updatedAt.toISOString(),
            })),
          });
        }

        return { snapshotStartedAt, sections };
      },
      { isolationLevel: 'RepeatableRead', timeout: 120_000 },
    );
  }

  private projectRecord(model: string, value: unknown): { readonly [key: string]: JsonValue } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Tenant export model '${model}' returned an invalid record`);
    }
    const source = value as Record<string, unknown>;
    const omitted = OMIT_FIELDS[model] ?? new Set<string>();
    const projected: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(source)) {
      if (omitted.has(key)) continue;
      projected[key] = portableValue(entry, `${model}.${key}`, key);
    }

    if (model === 'SourceEvent') {
      projected.payload = source.payloadPurgedAt
        ? null
        : portableValue(
            this.payloadCrypto.decrypt(
              {
                ciphertext: requireBytes(source.payloadCiphertext, 'payloadCiphertext'),
                iv: requireBytes(source.payloadIv, 'payloadIv'),
                authTag: requireBytes(source.payloadAuthTag, 'payloadAuthTag'),
                keyVersion: requireString(source.payloadKeyVersion, 'payloadKeyVersion'),
              },
              sourceEventAuthenticatedContext(
                requireString(source.tenantId, 'tenantId'),
                requireString(source.eventId, 'eventId'),
                requireString(source.eventType, 'eventType'),
                requireNumber(source.eventVersion, 'eventVersion'),
              ),
            ),
            'SourceEvent.payload',
            'payload',
          );
    }
    return projected;
  }
}

function getDelegate(transaction: PrismaTransaction, model: string): ExportDelegate {
  const name = `${model[0]?.toLowerCase() ?? ''}${model.slice(1)}`;
  const candidate = (transaction as unknown as Record<string, unknown>)[name];
  if (!candidate || typeof candidate !== 'object' || !('findMany' in candidate)) {
    throw new Error(`Tenant export has no Prisma delegate for '${model}'`);
  }
  return candidate as ExportDelegate;
}

function portableValue(value: unknown, path: string, fieldName?: string): JsonValue {
  if (fieldName && SECRET_FIELD.test(fieldName)) return '[REDACTED]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error(`Tenant export contains a non-finite number at ${path}`);
    return Number.isInteger(value) && !Number.isSafeInteger(value) ? value.toString() : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) {
    return value.map((entry, index) => portableValue(entry, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    if (value.constructor?.name === 'Decimal' && 'toString' in value) {
      return String(value);
    }
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      result[key] = portableValue(entry, `${path}.${key}`, key);
    }
    return result;
  }
  throw new Error(`Tenant export contains an unsupported value at ${path}`);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Source event ${field} is invalid`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Source event ${field} is invalid`);
  }
  return value;
}

function requireBytes(value: unknown, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`Source event ${field} is invalid`);
  return value;
}

function assertInventoryHasLoadStrategy(): void {
  const sections = new Set<string>();
  for (const entry of TENANT_EXPORT_INVENTORY) {
    if (!entry.disposition.startsWith('EXPORT')) continue;
    if (!entry.section) throw new Error(`Tenant export model '${entry.model}' has no section`);
    if (sections.has(entry.section))
      throw new Error(`Duplicate tenant export section '${entry.section}'`);
    sections.add(entry.section);
  }
}
