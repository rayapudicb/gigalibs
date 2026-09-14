import { createHash } from 'node:crypto';

// The standalone AR boundary uses UUID tenant keys while the platform control plane
// uses opaque canonical IDs. This one-way, deterministic binding preserves isolation
// without accepting a browser-provided tenant or falling back to a default tenant.
export function arTenantBindingId(canonicalTenantId: string): string {
  if (!canonicalTenantId || canonicalTenantId.length > 200) {
    throw new Error('Canonical tenant identity is invalid.');
  }
  const bytes = createHash('sha256')
    .update('gigalibs:ar:tenant-binding:v1\0')
    .update(canonicalTenantId)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const moduleTenantBindingId = arTenantBindingId;
