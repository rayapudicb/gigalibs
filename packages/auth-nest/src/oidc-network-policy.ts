import { isIP } from 'node:net';

export function isLoopbackOidcAddress(address: string): boolean {
  return address === '127.0.0.1' || address.startsWith('127.') || address === '::1';
}

export function isForbiddenOidcAddress(address: string): boolean {
  if (!isIP(address) || isLoopbackOidcAddress(address) || address === '::') return true;
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    return (
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('2001:db8:') ||
      lower.startsWith('::ffff:')
    );
  }
  const octets = address.split('.').map(Number);
  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}
