// WI-OI-140 M-REQ: a small QR Code encoder for request-link labels (ISO/IEC 18004): byte mode, error correction
// level M, versions 1–15 (up to 412 bytes), lowest-penalty mask. It follows the structure of Project Nayuki's
// reference implementation; no network, no dependency.

/** Error-correction codewords per block and the blocks' data lengths, level M, versions 1–15. */
const LEVEL_M: readonly (readonly [ecPerBlock: number, blocks: readonly (readonly [count: number, dataCodewords: number])[]])[] = [
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]], [30, [[1, 50], [4, 51]]],
  [22, [[6, 36], [2, 37]]], [22, [[8, 37], [1, 38]]], [24, [[4, 40], [5, 41]]], [24, [[5, 41], [5, 42]]],
];
const ALIGNMENT: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
  [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
];
const MAX_VERSION = LEVEL_M.length;

const dataCodewords = (version: number) => LEVEL_M[version - 1]![1].reduce((sum, [count, length]) => sum + count * length, 0);

/** GF(256) multiplication modulo x^8 + x^4 + x^3 + x^2 + 1. */
function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = multiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = multiply(root, 0x02);
  }
  return result;
}

/** Reed–Solomon error-correction codewords of `data` (exported for its test vector). */
export function reedSolomon(data: readonly number[], degree: number): number[] {
  const generator = divisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    generator.forEach((coefficient, index) => {
      result[index]! ^= multiply(coefficient, factor);
    });
  }
  return result;
}

/** BCH-protected format bits for level M and a mask (exported for its test vector). */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

function codewords(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCodewords(version);
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);
  const [ecPerBlock, groups] = LEVEL_M[version - 1]!;
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (const [count, length] of groups)
    for (let i = 0; i < count; i++) {
      const block = data.slice(offset, offset + length);
      offset += length;
      blocks.push({ data: block, ec: reedSolomon(block, ecPerBlock) });
    }
  const out: number[] = [];
  const longest = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < longest; i++) for (const block of blocks) if (i < block.data.length) out.push(block.data[i]!);
  for (let i = 0; i < ecPerBlock; i++) for (const block of blocks) out.push(block.ec[i]!);
  return out;
}

class Matrix {
  readonly size: number;
  readonly dark: boolean[][];
  readonly reserved: boolean[][];
  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.dark[y]![x] = dark;
    this.reserved[y]![x] = true;
  }
  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [this.size - 4, 3], [3, this.size - 4]] as const)
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.set(x, y, distance !== 2 && distance !== 4);
        }
    const positions = ALIGNMENT[this.version - 1]!;
    const last = positions.length - 1;
    positions.forEach((x, i) =>
      positions.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.drawFormat(0);
    if (this.version >= 7) {
      const bits = versionBits(this.version);
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = this.size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }
  drawFormat(mask: number) {
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i));
    this.set(8, this.size - 8, true);
  }
  drawCodewords(data: readonly number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.reserved[y]![x] && i < data.length * 8) {
            this.dark[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        if (this.reserved[y]![x]) continue;
        const flip = [
          (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
          ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
        ][mask];
        if (flip) this.dark[y]![x] = !this.dark[y]![x];
      }
  }
  penalty(): number {
    let score = 0;
    const lines = [...this.dark, ...this.dark.map((_, x) => this.dark.map((row) => row[x]!))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      const text = line.map((dark) => (dark ? '1' : '0')).join('');
      for (const pattern of ['10111010000', '00001011101']) for (let at = text.indexOf(pattern); at >= 0; at = text.indexOf(pattern, at + 1)) score += 40;
    }
    for (let y = 0; y + 1 < this.size; y++)
      for (let x = 0; x + 1 < this.size; x++) {
        const c = this.dark[y]![x];
        if (c === this.dark[y]![x + 1] && c === this.dark[y + 1]![x] && c === this.dark[y + 1]![x + 1]) score += 3;
      }
    const dark = this.dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs((dark * 100) / (this.size * this.size) - 50) / 5) * 10;
    return score;
  }
}

/** The QR Code of `text` (UTF-8, byte mode, level M) as rows of dark modules, without the quiet zone. */
export function qrModules(text: string): { readonly version: number; readonly mask: number; readonly modules: boolean[][] } {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= MAX_VERSION && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > MAX_VERSION) throw new Error('Too long for a request-link label.');
  const data = codewords(bytes, version);
  let best: { mask: number; matrix: Matrix; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const matrix = new Matrix(version);
    matrix.drawFunctionPatterns();
    matrix.drawCodewords(data);
    matrix.applyMask(mask);
    matrix.drawFormat(mask);
    const score = matrix.penalty();
    if (!best || score < best.score) best = { mask, matrix, score };
  }
  return { version, mask: best!.mask, modules: best!.matrix.dark };
}

/** An SVG path (1 unit per module, 4-module quiet zone) for `text`. */
export function qrSvgPath(text: string): { readonly path: string; readonly size: number } {
  const { modules } = qrModules(text);
  const parts: string[] = [];
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) parts.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  }));
  return { path: parts.join(''), size: modules.length + 8 };
}
