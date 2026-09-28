import { createPrivateKey, createPublicKey } from 'node:crypto';

/** ADR-0007 option A settings for the Workforce side of the CMMS handshake. */
export interface WorkforceRelayConfig {
  /** Verifies relay tokens from CMMS; the inbox answers 503 when absent. */
  readonly inboxPublicKey: string | null;
  /** Delivers Workforce facts to the CMMS inbox; the relay is off when absent. */
  readonly outbound: { readonly targetOrigin: string; readonly privateKey: string } | null;
  readonly intervalMs: number;
}

export const WORKFORCE_RELAY_CONFIG = Symbol('WORKFORCE_RELAY_CONFIG');
export const WORKFORCE_INBOX_AUDIENCE = 'gigalibs-workforce-inbox';
export const CMMS_INBOX_AUDIENCE = 'gigalibs-cmms-inbox';

export function loadWorkforceRelayConfig(environment: NodeJS.ProcessEnv = process.env): WorkforceRelayConfig {
  const inbox = environment.WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64?.trim();
  const target = environment.WORKFORCE_RELAY_CMMS_URL?.trim();
  const signing = environment.CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64?.trim();
  if ((target ? 1 : 0) + (signing ? 1 : 0) === 1) {
    throw new Error('Set both WORKFORCE_RELAY_CMMS_URL and CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64, or neither.');
  }
  return Object.freeze({
    inboxPublicKey: inbox ? publicPem(inbox, 'WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64') : null,
    outbound: target && signing ? { targetOrigin: relayOrigin(target, 'cmms-api'), privateKey: privatePem(signing, 'CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64') } : null,
    intervalMs: relayInterval(environment.WORKFORCE_RELAY_INTERVAL_MS, 'WORKFORCE_RELAY_INTERVAL_MS'),
  });
}

function relayInterval(raw: string | undefined, name: string): number {
  const value = raw?.trim() ? Number(raw.trim()) : 1_000;
  if (!Number.isInteger(value) || value < 100 || value > 60_000) throw new Error(`${name} must be an integer between 100 and 60000.`);
  return value;
}

/** Only a loopback or the peer's Compose service origin, without credentials or a path. */
export function relayOrigin(raw: string, serviceHostname: string): string {
  const url = new URL(raw);
  const allowed = ['localhost', '127.0.0.1', '::1', '[::1]', serviceHostname].includes(url.hostname);
  if (!allowed || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`The relay target must be the ${serviceHostname} service origin.`);
  }
  return url.origin;
}

function publicPem(base64: string, name: string): string {
  try {
    const key = createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error(`${name} must be an Ed25519 public key.`);
  }
}

function privatePem(base64: string, name: string): string {
  try {
    const key = createPrivateKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('type');
    return key.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch {
    throw new Error(`${name} must be an Ed25519 private key.`);
  }
}
