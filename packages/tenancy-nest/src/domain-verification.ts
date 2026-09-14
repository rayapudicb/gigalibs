import { createHash } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

const FORBIDDEN_SUFFIXES = ['.example', '.invalid', '.localhost', '.local', '.test', '.internal'];

export function normalizeTenantDomain(input: string): string {
  const candidate = input.trim().replace(/\.$/, '').toLowerCase();
  if (
    !candidate ||
    candidate.includes('://') ||
    candidate.includes('/') ||
    candidate.includes(':')
  ) {
    throw new Error('Enter a hostname without a protocol, port, or path');
  }
  const ascii = domainToASCII(candidate);
  if (!ascii || ascii.length > 253 || isIP(ascii) !== 0 || !ascii.includes('.')) {
    throw new Error('Enter a valid public DNS hostname');
  }
  if (
    ascii === 'localhost' ||
    FORBIDDEN_SUFFIXES.some((suffix) => ascii.endsWith(suffix)) ||
    !ascii
      .split('.')
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  ) {
    throw new Error('Enter a valid public DNS hostname');
  }
  return ascii;
}

export function domainVerificationRecordName(domain: string): string {
  return `_gigalibs-verification.${domain}`;
}

export function domainVerificationDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function matchingTxtRecord(records: readonly (readonly string[])[], expectedDigest: string) {
  return records.some((segments) => domainVerificationDigest(segments.join('')) === expectedDigest);
}

export async function resolveDomainVerification(
  recordName: string,
  expectedDigest: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  const resolver = new Resolver();
  let timer: NodeJS.Timeout | undefined;
  try {
    const records = await Promise.race([
      resolver.resolveTxt(recordName),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          resolver.cancel();
          reject(new Error('DNS verification timed out'));
        }, timeoutMs);
      }),
    ]);
    return matchingTxtRecord(records, expectedDigest);
  } catch (error) {
    if (isNoRecordError(error)) return false;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isNoRecordError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ENODATA' || code === 'ENOTFOUND';
}
