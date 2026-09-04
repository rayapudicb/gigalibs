import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ConnectorFailure } from './connector-errors.js';

export interface ConnectorNetworkPolicy {
  allowedHosts: readonly string[];
  allowedPorts: ReadonlySet<number>;
  allowPrivateNetworks: boolean;
}

export function validateAllowedHostAndPort(
  hostnameWithBrackets: string,
  port: number,
  policy: ConnectorNetworkPolicy,
): string {
  const hostname = hostnameWithBrackets.toLowerCase().replace(/^\[|\]$/g, '');
  const allowed = policy.allowedHosts.some((entry) =>
    entry.startsWith('*.')
      ? hostname.endsWith(entry.slice(1)) && hostname !== entry.slice(2)
      : hostname === entry,
  );
  if (!allowed) {
    throw new ConnectorFailure(
      'HOST_NOT_ALLOWLISTED',
      'The connector host is not in the deployment allowlist.',
    );
  }
  if (!policy.allowedPorts.has(port)) {
    throw new ConnectorFailure(
      'PORT_NOT_ALLOWLISTED',
      'The connector port is not in the deployment allowlist.',
    );
  }
  return hostname;
}

export async function resolveAllowedAddress(
  hostnameWithBrackets: string,
  policy: ConnectorNetworkPolicy,
): Promise<{ address: string; family: number }> {
  const hostname = hostnameWithBrackets.replace(/^\[|\]$/g, '');
  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new ConnectorFailure(
          'DNS_RESOLUTION_FAILED',
          'The connector host could not be resolved.',
        );
      });
  if (addresses.length === 0) {
    throw new ConnectorFailure(
      'DNS_RESOLUTION_FAILED',
      'The connector host did not resolve to an address.',
    );
  }
  if (!policy.allowPrivateNetworks && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new ConnectorFailure(
      'PRIVATE_NETWORK_BLOCKED',
      'Private and link-local connector destinations are disabled.',
    );
  }
  return addresses[0] as { address: string; family: number };
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const octets = ipv4.split('.').map(Number);
  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}
