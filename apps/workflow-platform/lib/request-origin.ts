export function requestOrigin(request: Request): string {
  const incoming = new URL(request.url);
  if (incoming.hostname !== '0.0.0.0' && incoming.hostname !== '::') return incoming.origin;
  const host = request.headers.get('host');
  if (!host || !/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) {
    return incoming.origin;
  }
  return `${incoming.protocol}//${host}`;
}
