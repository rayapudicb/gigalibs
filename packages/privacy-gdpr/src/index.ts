import { createHash, sign, verify, type KeyLike } from 'node:crypto';

export * from './inventory.js';

export const VERSION = '0.0.1';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface TenantExportSection {
  /** Stable lowercase identifier, for example `members` or `invoices`. */
  name: string;
  /** Records must already be authorized, tenant-scoped and converted to JSON values. */
  records: ReadonlyArray<{ readonly [key: string]: JsonValue }>;
  /** Optional explicit CSV column order. Missing record values are emitted as empty cells. */
  csvColumns?: readonly string[];
}

export interface TenantExportFileManifest {
  path: string;
  mediaType: 'application/json' | 'text/csv';
  bytes: number;
  sha256: string;
  recordCount: number;
}

export interface TenantExportManifest {
  format: 'gigalibs.tenant-portability.v1';
  exportId: string;
  tenantId: string;
  generatedAt: string;
  files: TenantExportFileManifest[];
  totalRecords: number;
}

export interface TenantExportSignature {
  algorithm: 'Ed25519';
  keyId: string;
  manifestSha256: string;
  value: string;
}

export interface TenantExportBundle {
  manifest: TenantExportManifest;
  manifestJson: string;
  signature: TenantExportSignature;
  /** Deterministic UTF-8 file contents. Packaging/storage is owned by the caller. */
  files: Readonly<Record<string, string>>;
}

export interface TenantExportArchive {
  bytes: Buffer;
  sha256: string;
  byteSize: number;
}

export interface CreateTenantExportBundleInput {
  exportId: string;
  tenantId: string;
  generatedAt: Date | string;
  keyId: string;
  privateKey: KeyLike;
  sections: readonly TenantExportSection[];
}

const SECTION_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

/**
 * Builds and signs deterministic JSON/CSV export files. This function deliberately does not query a
 * database: the owning service must first prove complete tenant-scoped inventory and authorization.
 */
export function createTenantExportBundle(input: CreateTenantExportBundleInput): TenantExportBundle {
  assertIdentifier('exportId', input.exportId);
  assertIdentifier('tenantId', input.tenantId);
  assertIdentifier('keyId', input.keyId);
  const generatedAt = normalizeInstant(input.generatedAt);
  const names = new Set<string>();
  const files: Record<string, string> = {};
  const fileManifests: TenantExportFileManifest[] = [];

  for (const section of [...input.sections].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!SECTION_NAME.test(section.name)) {
      throw new Error(`Invalid tenant export section name '${section.name}'`);
    }
    if (names.has(section.name)) throw new Error(`Duplicate tenant export section '${section.name}'`);
    names.add(section.name);
    section.records.forEach((record) => assertJsonValue(record));

    const jsonPath = `data/${section.name}.json`;
    const json = `${canonicalJson({ records: section.records } as unknown as JsonValue)}\n`;
    files[jsonPath] = json;
    fileManifests.push(fileManifest(jsonPath, 'application/json', json, section.records.length));

    const columns = resolveCsvColumns(section);
    const csvPath = `data/${section.name}.csv`;
    const csv = renderCsv(section.records, columns);
    files[csvPath] = csv;
    fileManifests.push(fileManifest(csvPath, 'text/csv', csv, section.records.length));
  }

  const manifest: TenantExportManifest = {
    format: 'gigalibs.tenant-portability.v1',
    exportId: input.exportId,
    tenantId: input.tenantId,
    generatedAt,
    files: fileManifests,
    totalRecords: input.sections.reduce((total, section) => total + section.records.length, 0),
  };
  const manifestJson = `${canonicalJson(manifest as unknown as JsonValue)}\n`;
  const manifestSha256 = sha256(manifestJson);
  const signatureValue = sign(null, Buffer.from(manifestJson, 'utf8'), input.privateKey).toString(
    'base64url',
  );

  return {
    manifest,
    manifestJson,
    signature: {
      algorithm: 'Ed25519',
      keyId: input.keyId,
      manifestSha256,
      value: signatureValue,
    },
    files: Object.freeze({ ...files }),
  };
}

/** Verifies the signed manifest and every file digest before a bundle is trusted. */
export function verifyTenantExportBundle(bundle: TenantExportBundle, publicKey: KeyLike): boolean {
  if (bundle.signature.algorithm !== 'Ed25519') return false;
  if (sha256(bundle.manifestJson) !== bundle.signature.manifestSha256) return false;
  if (`${canonicalJson(bundle.manifest as unknown as JsonValue)}\n` !== bundle.manifestJson) return false;

  const expectedPaths = new Set(bundle.manifest.files.map((file) => file.path));
  const actualPaths = Object.keys(bundle.files);
  if (expectedPaths.size !== actualPaths.length) return false;
  for (const path of actualPaths) if (!expectedPaths.has(path)) return false;

  for (const file of bundle.manifest.files) {
    const content = bundle.files[file.path];
    if (content === undefined) return false;
    if (Buffer.byteLength(content, 'utf8') !== file.bytes) return false;
    if (sha256(content) !== file.sha256) return false;
  }

  try {
    return verify(
      null,
      Buffer.from(bundle.manifestJson, 'utf8'),
      publicKey,
      Buffer.from(bundle.signature.value, 'base64url'),
    );
  } catch {
    return false;
  }
}

/**
 * Packages a signed bundle as a deterministic, uncompressed ZIP archive. The archive contains only
 * UTF-8 text files and uses a fixed ZIP timestamp so retrying the same completed snapshot produces
 * identical bytes and an identical archive digest.
 */
export function createTenantExportArchive(bundle: TenantExportBundle): TenantExportArchive {
  const entries = [
    { path: 'manifest.json', content: bundle.manifestJson },
    {
      path: 'signature.json',
      content: `${canonicalJson(bundle.signature as unknown as JsonValue)}\n`,
    },
    ...Object.entries(bundle.files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({ path, content })),
  ];
  const paths = new Set<string>();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    assertArchivePath(entry.path);
    if (paths.has(entry.path)) throw new Error(`Duplicate tenant export archive path '${entry.path}'`);
    paths.add(entry.path);
    const name = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }

  if (entries.length > 0xffff) throw new Error('Tenant export archive has too many files');
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  const bytes = Buffer.concat([...localParts, centralDirectory, end]);
  return { bytes, sha256: sha256Bytes(bytes), byteSize: bytes.length };
}

/** Parses the constrained archive format and verifies its signature and all contained data. */
export function verifyTenantExportArchive(bytes: Buffer, publicKey: KeyLike): boolean {
  try {
    const files = readStoredZip(bytes);
    const manifestJson = files['manifest.json'];
    const signatureJson = files['signature.json'];
    if (manifestJson === undefined || signatureJson === undefined) return false;
    delete files['manifest.json'];
    delete files['signature.json'];
    const manifest = JSON.parse(manifestJson) as TenantExportManifest;
    const signature = JSON.parse(signatureJson) as TenantExportSignature;
    return verifyTenantExportBundle({ manifest, manifestJson, signature, files }, publicKey);
  } catch {
    return false;
  }
}

export function canonicalJson(value: JsonValue): string {
  assertJsonValue(value);
  return serializeCanonical(value);
}

function serializeCanonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(',')}]`;
  const objectValue = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(objectValue[key] as JsonValue)}`)
    .join(',')}}`;
}

function assertJsonValue(value: unknown, path = '$'): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error(`Tenant export contains a non-safe JSON number at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) throw new Error(`Tenant export contains undefined at ${path}.${key}`);
      assertJsonValue(entry, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`Tenant export contains a non-JSON value at ${path}`);
}

function resolveCsvColumns(section: TenantExportSection): string[] {
  const columns = section.csvColumns
    ? [...section.csvColumns]
    : [...new Set(section.records.flatMap((record) => Object.keys(record)))].sort();
  if (new Set(columns).size !== columns.length) {
    throw new Error(`Duplicate CSV column in section '${section.name}'`);
  }
  for (const column of columns) {
    if (!column || column.length > 128) throw new Error(`Invalid CSV column in section '${section.name}'`);
  }
  return columns;
}

function renderCsv(
  records: ReadonlyArray<{ readonly [key: string]: JsonValue }>,
  columns: readonly string[],
): string {
  const rows = [columns.map(csvCell).join(',')];
  for (const record of records) {
    rows.push(
      columns
        .map((column) => {
          const value = record[column];
          if (value === undefined || value === null) return '';
          if (typeof value === 'object') return csvCell(canonicalJson(value));
          return csvCell(String(value));
        })
        .join(','),
    );
  }
  return `${rows.join('\r\n')}\r\n`;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function fileManifest(
  path: string,
  mediaType: TenantExportFileManifest['mediaType'],
  content: string,
  recordCount: number,
): TenantExportFileManifest {
  return {
    path,
    mediaType,
    bytes: Buffer.byteLength(content, 'utf8'),
    sha256: sha256(content),
    recordCount,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertArchivePath(path: string): void {
  if (
    !/^[a-z][a-z0-9._/-]{0,199}$/.test(path) ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('//') ||
    path.endsWith('/')
  ) {
    throw new Error(`Invalid tenant export archive path '${path}'`);
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readStoredZip(bytes: Buffer): Record<string, string> {
  if (bytes.length < 22) throw new Error('Tenant export archive is truncated');
  const endOffset = bytes.length - 22;
  if (bytes.readUInt32LE(endOffset) !== 0x06054b50 || bytes.readUInt16LE(endOffset + 20) !== 0) {
    throw new Error('Tenant export archive has an invalid end record');
  }
  const entries = bytes.readUInt16LE(endOffset + 10);
  if (entries !== bytes.readUInt16LE(endOffset + 8)) {
    throw new Error('Multi-disk tenant export archives are unsupported');
  }
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize !== endOffset) {
    throw new Error('Tenant export archive central directory is invalid');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const result: Record<string, string> = {};
  let cursor = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Tenant export archive central entry is invalid');
    }
    if (bytes.readUInt16LE(cursor + 10) !== 0) {
      throw new Error('Compressed tenant export entries are unsupported');
    }
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nextCursor = nameStart + nameLength + extraLength + commentLength;
    if (nextCursor > endOffset || compressedSize !== uncompressedSize) {
      throw new Error('Tenant export archive entry size is invalid');
    }
    const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    assertArchivePath(path);
    if (Object.hasOwn(result, path)) throw new Error(`Duplicate tenant export archive path '${path}'`);
    if (
      localHeaderOffset + 30 > centralOffset ||
      bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50 ||
      bytes.readUInt16LE(localHeaderOffset + 8) !== 0
    ) {
      throw new Error('Tenant export archive local entry is invalid');
    }
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (
      dataEnd > centralOffset ||
      decoder.decode(bytes.subarray(localNameStart, localNameStart + localNameLength)) !== path
    ) {
      throw new Error('Tenant export archive local path is invalid');
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== checksum) throw new Error('Tenant export archive checksum is invalid');
    result[path] = decoder.decode(data);
    cursor = nextCursor;
  }
  if (cursor !== endOffset) throw new Error('Tenant export archive has trailing central data');
  return result;
}

function normalizeInstant(value: Date | string): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error('generatedAt must be a valid absolute instant');
  return instant.toISOString();
}

function assertIdentifier(name: string, value: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(`${name} is invalid`);
}
