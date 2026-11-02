import { describe, expect, it } from 'vitest';
import { formatBits, qrModules, qrSvgPath, reedSolomon } from './qr';

// WI-OI-140: the request-link label encoder against published vectors and the QR structure. A phone scan of a printed
// label is the device proof (still open).
describe('QR encoder (WI-OI-140)', () => {
  it('computes Reed–Solomon codewords for the published HELLO WORLD 1-M message', () => {
    expect(reedSolomon([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10))
      .toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('protects the format bits as the standard table gives them', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect(formatBits(7).toString(2).padStart(15, '0')).toBe('100101010100000');
  });

  it('draws finders, timing and the dark module, and picks the version from the length', () => {
    const short = qrModules('HS-03');
    expect(short.version).toBe(1);
    expect(short.modules).toHaveLength(21);
    const token = `https://plant.example.invalid/r#tenant-a.10000000-0000-4000-8000-000000000001.${'A'.repeat(43)}`;
    const label = qrModules(token);
    expect(label.version).toBe(7);
    const size = label.modules.length;
    expect(size).toBe(45);
    const finder = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6].map((d) => label.modules[y]![x + d]);
    for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      expect(finder(x, y)).toEqual([true, true, true, true, true, true, true]);
      expect(finder(x, y + 2)).toEqual([true, false, true, true, true, false, true]);
    }
    expect(label.modules[6]!.slice(8, size - 8)).toEqual(Array.from({ length: size - 16 }, (_, i) => i % 2 === 0));
    expect(label.modules[size - 8]![8]).toBe(true);
    // Version 7 carries its version information (000111110010010100) beside the top-right finder.
    const versionInfo = Array.from({ length: 18 }, (_, i) => (label.modules[Math.floor(i / 3)]![size - 11 + (i % 3)] ? 1 : 0));
    expect(versionInfo.reverse().join('')).toBe('000111110010010100');
  });

  it('renders a square SVG path with a quiet zone and refuses text too long for a label', () => {
    const { path, size } = qrSvgPath('HS-03');
    expect(size).toBe(29);
    expect(path).toMatch(/^M4 4h1v1h-1z/);
    expect(() => qrModules('x'.repeat(500))).toThrow();
  });
});
