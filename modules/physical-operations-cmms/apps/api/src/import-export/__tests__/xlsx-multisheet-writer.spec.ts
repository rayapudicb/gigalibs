import { describe, it, expect, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import { sanitizeSheetName, XlsxMultiSheetWriter } from '../xlsx-multisheet-writer.js';

// ─── sanitizeSheetName ────────────────────────────────────────────────────────

describe('sanitizeSheetName', () => {
  it('returns the name unchanged when clean', () => {
    expect(sanitizeSheetName('Engineering')).toBe('Engineering');
  });

  it('strips Excel-illegal characters: / \\ ? * [ ] :', () => {
    const illegal = 'Dept/Sub\\Name?Has*Chars[ok]:end';
    const cleaned = sanitizeSheetName(illegal);
    expect(cleaned).not.toMatch(/[\/\\?*\[\]:]/);
  });

  it('truncates names longer than 31 characters', () => {
    const longName = 'A'.repeat(50);
    expect(sanitizeSheetName(longName).length).toBeLessThanOrEqual(31);
  });

  it('truncates AND strips in combination', () => {
    const tricky = 'A/B'.repeat(15); // 45 chars, contains /
    const result = sanitizeSheetName(tricky);
    expect(result.length).toBeLessThanOrEqual(31);
    expect(result).not.toContain('/');
  });

  it('preserves names of exactly 31 characters', () => {
    const name = 'X'.repeat(31);
    expect(sanitizeSheetName(name)).toBe(name);
  });

  it('handles empty string gracefully', () => {
    expect(() => sanitizeSheetName('')).not.toThrow();
    expect(sanitizeSheetName('').length).toBeLessThanOrEqual(31);
  });
});

// ─── XlsxMultiSheetWriter ────────────────────────────────────────────────────

describe('XlsxMultiSheetWriter', () => {
  const COLUMNS = ['id', 'name', 'department', 'role'];

  async function collectBuffer(writer: XlsxMultiSheetWriter): Promise<Buffer> {
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];

    const done = new Promise<Buffer>((resolve, reject) => {
      passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
      passthrough.on('end', () => resolve(Buffer.concat(chunks)));
      passthrough.on('error', reject);
    });

    await writer.open(passthrough);
    return done;
  }

  it('produces a non-empty buffer after writing one sheet', async () => {
    const writer = new XlsxMultiSheetWriter('workforce_resources', COLUMNS, []);
    const bufPromise = collectBuffer(writer);

    await writer.startSheet('Engineering');
    await writer.writeRow({ id: '1', name: 'Alice', department: 'Engineering', role: 'Engineer' });
    await writer.close();

    const buf = await bufPromise;
    expect(buf.length).toBeGreaterThan(100);
  });

  it('produces a larger buffer for two sheets than one sheet', async () => {
    async function makeBuffer(sheetCount: number) {
      const writer = new XlsxMultiSheetWriter('workforce_resources', COLUMNS, []);
      const passthrough = new PassThrough();
      const chunks: Buffer[] = [];
      const done = new Promise<Buffer>((resolve, reject) => {
        passthrough.on('data', (c: Buffer) => chunks.push(c));
        passthrough.on('end', () => resolve(Buffer.concat(chunks)));
        passthrough.on('error', reject);
      });
      await writer.open(passthrough);
      for (let s = 0; s < sheetCount; s++) {
        await writer.startSheet(`Sheet${s}`);
        await writer.writeRow({ id: `${s}`, name: 'Bob', department: `Dept${s}`, role: 'Tech' });
      }
      await writer.close();
      return done;
    }

    const one = await makeBuffer(1);
    const two = await makeBuffer(2);
    expect(two.length).toBeGreaterThan(one.length);
  });

  it('sanitizes sheet names automatically', async () => {
    const writer = new XlsxMultiSheetWriter('workforce_resources', COLUMNS, []);
    const passthrough = new PassThrough();
    passthrough.resume(); // drain
    await writer.open(passthrough);
    // Should not throw despite illegal characters
    await expect(writer.startSheet('Dept/Sub?Name')).resolves.not.toThrow();
    await writer.close();
  });

  it('allows writing zero rows on a sheet', async () => {
    const writer = new XlsxMultiSheetWriter('workforce_resources', COLUMNS, []);
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];
    const done = new Promise<void>((resolve) => {
      passthrough.on('data', (c: Buffer) => chunks.push(c));
      passthrough.on('end', resolve);
    });
    await writer.open(passthrough);
    await writer.startSheet('Empty');
    await writer.close();
    await done;
    expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  });
});
