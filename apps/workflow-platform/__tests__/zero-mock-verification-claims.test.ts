/** WI-OI-120bj: no UI timer pretends a cryptographic verification succeeded. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..');

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walkTsx(path, out);
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

describe('WI-OI-120bj: verification claims', () => {
  it('AR invoice detail does not simulate audit verification with a timer', () => {
    const page = join(WEB_ROOT, 'app/(app)/ar/invoices/[invoiceId]/page.tsx');
    const src = readFileSync(page, 'utf8');
    expect(src).not.toContain('handleAuditSeal');
    expect(src).not.toContain('Cryptographic Audit Verified');
    expect(src).not.toMatch(/setTimeout\([\s\S]*verified:\s*true/);
    expect(src).not.toMatch(/c8f29e/);
  });

  it('finds no other setTimeout-based "Cryptographic Audit Verified" strings in the web app', () => {
    const hits: string[] = [];
    for (const file of walkTsx(WEB_ROOT)) {
      if (file.includes('__tests__')) continue;
      const src = readFileSync(file, 'utf8');
      if (src.includes('Cryptographic Audit Verified')) hits.push(file.replace(`${WEB_ROOT}/`, ''));
    }
    expect(hits).toEqual([]);
  });
});
