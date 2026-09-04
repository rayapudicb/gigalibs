import { BadRequestException } from '@nestjs/common';

const SECRET_KEY_PATTERN =
  /(?:^|[_-])(password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|credential)(?:$|[_-])/i;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
  return `{${entries.join(',')}}`;
}

export function assertNoEmbeddedSecrets(value: unknown, path = '$'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoEmbeddedSecrets(child, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new BadRequestException(`Embedded secret material is not permitted at ${path}.${key}.`);
    }
    assertNoEmbeddedSecrets(child, `${path}.${key}`);
  }
}

export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
