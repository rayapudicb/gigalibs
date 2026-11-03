// WI-OI-160 (ADR-0039 §5): the relay wiring check. A relay is declared once in config/relay-wiring.json — the producer
// service with its target URL and signing key, the consumer service with the public key(s) it verifies with. This
// checks the declarations against the Compose services and the code, so a relay cannot be configured on the wrong
// service again (QA-046: the party relay keys sat on kernel-worker while api sent the facts).
// Used by scripts/verify-relay-wiring.mjs; tested in packages/configuration-core/src/relay-wiring.test.ts.

/** A relay variable: a target URL or a key, named for a relay or an inbox (paths and intervals are not keys). */
export const RELAY_VARIABLE = /(RELAY|INBOX).*(_URL|_KEY_BASE64)$/;

/**
 * @param {{ relays: Array<{ key: string, from: string, to: string, status: 'wired' | 'not-wired', reason?: string,
 *   producer: { service: string, url: string, signingKey: string },
 *   consumer: { service: string, publicKeys: string[] } }> }} registry
 * @param {Record<string, readonly string[]>} servicesEnv  Compose service → the environment variable names it sets
 * @param {ReadonlySet<string>} codeNames                   every relay variable name the code reads
 * @returns {{ wired: string[], notWired: Array<{ key: string, reason: string }>, violations: Array<[string, string]> }}
 */
export function checkRelayWiring(registry, servicesEnv, codeNames) {
  const violations = [];
  const wired = [];
  const notWired = [];
  const has = (service, name) => (servicesEnv[service] ?? []).includes(name);
  const claimed = new Map(); // service → names a wired relay puts there
  const anywhere = new Set(); // names of not-wired relays, allowed wherever they sit today
  const keys = new Set();
  for (const relay of registry.relays) {
    if (keys.has(relay.key)) violations.push(['RELAY_DUPLICATE', `${relay.key} is declared twice.`]);
    keys.add(relay.key);
    const names = [relay.producer.url, relay.producer.signingKey, ...relay.consumer.publicKeys];
    for (const name of names)
      if (!codeNames.has(name)) violations.push(['RELAY_NAME_UNKNOWN', `${relay.key}: no code reads ${name}.`]);
    if (relay.status === 'not-wired') {
      if (!relay.reason?.trim()) violations.push(['RELAY_REASON', `${relay.key} is not wired and gives no reason.`]);
      notWired.push({ key: relay.key, reason: relay.reason ?? '' });
      for (const name of names) anywhere.add(name);
      continue;
    }
    for (const [service, name] of [
      [relay.producer.service, relay.producer.url],
      [relay.producer.service, relay.producer.signingKey],
      ...relay.consumer.publicKeys.map((key) => [relay.consumer.service, key]),
    ]) {
      if (!servicesEnv[service]) violations.push(['RELAY_SERVICE_UNKNOWN', `${relay.key}: no Compose service ${service}.`]);
      else if (!has(service, name)) violations.push(['RELAY_NOT_ON_SERVICE', `${relay.key}: ${name} is not set on ${service}.`]);
      claimed.set(service, new Set([...(claimed.get(service) ?? []), name]));
    }
    wired.push(relay.key);
  }
  for (const [service, names] of Object.entries(servicesEnv))
    for (const name of names)
      if (RELAY_VARIABLE.test(name) && !claimed.get(service)?.has(name) && !anywhere.has(name))
        violations.push(['RELAY_STRAY', `${name} is set on ${service}, but no relay declares it there (wrong service?).`]);
  return { wired, notWired, violations };
}
