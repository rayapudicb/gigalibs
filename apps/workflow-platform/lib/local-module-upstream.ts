export type LocalModuleUpstream = 'analytics' | 'cmms' | 'connector-hub' | 'geospatial' | 'workforce';

interface UpstreamContract {
  readonly environmentKey:
    | 'ANALYTICS_API_URL'
    | 'CMMS_API_URL'
    | 'CONNECTOR_HUB_API_URL'
    | 'GEOSPATIAL_API_URL'
    | 'WORKFORCE_API_URL';
  readonly port: string;
  readonly serviceHostname: string;
}

const CONTRACTS: Readonly<Record<LocalModuleUpstream, UpstreamContract>> = Object.freeze({
  analytics: Object.freeze({
    environmentKey: 'ANALYTICS_API_URL',
    port: '4400',
    serviceHostname: 'analytics-api',
  }),
  cmms: Object.freeze({
    environmentKey: 'CMMS_API_URL',
    port: '4200',
    serviceHostname: 'cmms-api',
  }),
  'connector-hub': Object.freeze({
    environmentKey: 'CONNECTOR_HUB_API_URL',
    port: '4100',
    serviceHostname: 'connector-hub-api',
  }),
  geospatial: Object.freeze({
    environmentKey: 'GEOSPATIAL_API_URL',
    port: '4720',
    serviceHostname: 'geospatial-api',
  }),
  workforce: Object.freeze({
    environmentKey: 'WORKFORCE_API_URL',
    port: '4700',
    serviceHostname: 'workforce-api',
  }),
});

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Resolves an internal module origin without turning a BFF route into an arbitrary URL proxy.
 * Only the module's exact loopback or Compose service origin is accepted.
 */
export function localModuleUpstreamOrigin(
  module: LocalModuleUpstream,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const contract = CONTRACTS[module];
  const configured = environment[contract.environmentKey]?.trim();
  if (!configured) {
    throw new Error(`Local module runtime requires ${contract.environmentKey}.`);
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`Local module runtime rejected ${contract.environmentKey}.`);
  }

  const allowedHostname =
    LOOPBACK_HOSTNAMES.has(url.hostname) || url.hostname === contract.serviceHostname;
  if (
    url.protocol !== 'http:' ||
    !allowedHostname ||
    url.port !== contract.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Local module runtime rejected ${contract.environmentKey}.`);
  }

  return url.origin;
}
