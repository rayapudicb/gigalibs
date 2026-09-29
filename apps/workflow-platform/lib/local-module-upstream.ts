import {
  type GeneratedModuleUpstream,
  generatedModuleUpstreams,
} from '@/lib/generated/module-upstreams';

/** A module service the web gateway may reach, declared in `spec.api.upstream` of its manifest (WI-OI-083c). */
export type LocalModuleUpstream = GeneratedModuleUpstream;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Resolves an internal module origin without turning a BFF route into an arbitrary URL proxy.
 * Only the module's exact loopback or Compose service origin is accepted.
 */
export function localModuleUpstreamOrigin(
  module: LocalModuleUpstream,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const contract = generatedModuleUpstreams[module];
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

/**
 * The module URL for a gateway path: its exact origin plus, for a module inside the shared module host, its base path
 * (WI-OI-085e). Each segment is encoded, and dot segments are refused, so the URL stays under the base path.
 */
export function localModuleUpstreamUrl(
  module: LocalModuleUpstream,
  path: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): URL {
  if (path.some((segment) => segment === '.' || segment === '..' || segment === ''))
    throw new Error('Module paths may not contain empty or dot segments.');
  const basePath = generatedModuleUpstreams[module].basePath;
  return new URL(
    `${basePath}/${path.map(encodeURIComponent).join('/')}`,
    localModuleUpstreamOrigin(module, environment),
  );
}
