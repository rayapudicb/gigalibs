/** Credential-free HTTP origins allowed for the suite AR BFF proxy (local / compose only). */
const LOCAL_AR_UPSTREAM_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'ar-api',
]);

export function parseLocalArUpstreamOrigin(raw: string | undefined): string {
  const configured = raw?.trim();
  if (!configured) throw new Error('Local AR UAT requires AR_API_URL.');
  const url = new URL(configured);
  if (
    url.protocol !== 'http:' ||
    !LOCAL_AR_UPSTREAM_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/'
  ) {
    throw new Error('Local AR UAT requires a credential-free loopback AR_API_URL origin.');
  }
  return url.origin;
}
