import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createTenantExportArchive,
  createTenantExportBundle,
  verifyTenantExportArchive,
  verifyTenantExportBundle,
  TENANT_EXPORT_INVENTORY,
} from './index.js';

const generatedAt = new Date('2026-09-10T00:00:00.000Z');

describe('tenant portability bundle', () => {
  it('classifies every canonical Prisma model exactly once', () => {
    const schemaPath = process.cwd().endsWith('packages/privacy-gdpr')
      ? resolve(process.cwd(), '../db/schema.prisma')
      : resolve(process.cwd(), 'packages/db/schema.prisma');
    const schema = readFileSync(schemaPath, 'utf8');
    const schemaModels = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
    const inventoryModels = TENANT_EXPORT_INVENTORY.map((entry) => entry.model);

    expect(new Set(inventoryModels).size).toBe(inventoryModels.length);
    expect([...inventoryModels].sort()).toEqual([...schemaModels].sort());
    for (const entry of TENANT_EXPORT_INVENTORY) {
      expect(entry.rationale.length).toBeGreaterThan(10);
      if (entry.disposition.startsWith('EXPORT')) expect(entry.section).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      else expect(entry.section).toBeUndefined();
    }
  });

  it('builds deterministic signed JSON and CSV files from isolated certification records', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const input = {
      exportId: 'cert-export-001',
      tenantId: 'cert-tenant-001',
      generatedAt,
      keyId: 'cert-key-001',
      privateKey,
      sections: [
        {
          name: 'members',
          records: [
            {
              id: 'cert-user-1',
              name: 'Certification, User',
              roles: ['VIEWER'],
              active: true,
            },
          ],
          csvColumns: ['id', 'name', 'roles', 'active'],
        },
        { name: 'invoices', records: [] },
      ],
    } as const;

    const first = createTenantExportBundle(input);
    const second = createTenantExportBundle(input);

    expect(first.manifestJson).toBe(second.manifestJson);
    expect(first.signature.value).toBe(second.signature.value);
    expect(first.manifest.totalRecords).toBe(1);
    expect(first.files['data/members.csv']).toContain('"Certification, User"');
    expect(verifyTenantExportBundle(first, publicKey)).toBe(true);

    const firstArchive = createTenantExportArchive(first);
    const secondArchive = createTenantExportArchive(second);
    expect(firstArchive.bytes.equals(secondArchive.bytes)).toBe(true);
    expect(firstArchive.sha256).toBe(secondArchive.sha256);
    expect(firstArchive.byteSize).toBe(firstArchive.bytes.length);
    expect(verifyTenantExportArchive(firstArchive.bytes, publicKey)).toBe(true);
  });

  it('rejects a modified file even when the signed manifest is unchanged', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const bundle = createTenantExportBundle({
      exportId: 'cert-export-002',
      tenantId: 'cert-tenant-001',
      generatedAt,
      keyId: 'cert-key-001',
      privateKey,
      sections: [{ name: 'audit', records: [{ id: 'cert-audit-1', action: 'EXPORT' }] }],
    });
    const changed = {
      ...bundle,
      files: { ...bundle.files, 'data/audit.json': '{"records":[]}\n' },
    };

    expect(verifyTenantExportBundle(changed, publicKey)).toBe(false);

    const archive = createTenantExportArchive(bundle);
    const tamperedArchive = Buffer.from(archive.bytes);
    const contentOffset = tamperedArchive.indexOf('cert-audit-1');
    expect(contentOffset).toBeGreaterThan(0);
    tamperedArchive[contentOffset] = 'x'.charCodeAt(0);
    expect(verifyTenantExportArchive(tamperedArchive, publicKey)).toBe(false);
  });

  it('fails closed for invalid section names and unsafe numeric values', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    expect(() =>
      createTenantExportBundle({
        exportId: 'cert-export-003',
        tenantId: 'cert-tenant-001',
        generatedAt,
        keyId: 'cert-key-001',
        privateKey,
        sections: [{ name: '../members', records: [] }],
      }),
    ).toThrow('Invalid tenant export section name');

    expect(() =>
      createTenantExportBundle({
        exportId: 'cert-export-004',
        tenantId: 'cert-tenant-001',
        generatedAt,
        keyId: 'cert-key-001',
        privateKey,
        sections: [{ name: 'invoices', records: [{ unsafe: Number.MAX_SAFE_INTEGER + 1 }] }],
      }),
    ).toThrow('non-safe JSON number');

    expect(() =>
      createTenantExportBundle({
        exportId: 'cert-export-005',
        tenantId: 'cert-tenant-001',
        generatedAt,
        keyId: 'cert-key-001',
        privateKey,
        sections: [{ name: 'rates', records: [{ value: 12.625 }] }],
      }),
    ).not.toThrow();
  });
});
