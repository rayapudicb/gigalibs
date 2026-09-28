import { createPrivateKey, createPublicKey } from 'node:crypto';

/** ADR-0007 option A settings for the CMMS side of the Workforce handshake. */
export interface CmmsRelayConfig {
  /** Verifies relay tokens from Workforce; the inbox answers 503 when absent. */
  readonly inboxPublicKey: string | null;
  /** Delivers CMMS staffing facts to the Workforce inbox; the relay is off when absent. */
  readonly outbound: { readonly targetOrigin: string; readonly privateKey: string } | null;
  readonly intervalMs: number;
}

export const CMMS_RELAY_CONFIG = Symbol('CMMS_RELAY_CONFIG');
export const WORKFORCE_INBOX_AUDIENCE = 'gigalibs-workforce-inbox';
export const CMMS_INBOX_AUDIENCE = 'gigalibs-cmms-inbox';

export function loadCmmsRelayConfig(environment: NodeJS.ProcessEnv = process.env): CmmsRelayConfig {
  const inbox = environment.CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64?.trim();
  const target = environment.CMMS_RELAY_WORKFORCE_URL?.trim();
  const signing = environment.WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64?.trim();
  if ((target ? 1 : 0) + (signing ? 1 : 0) === 1) {
    throw new Error('Set both CMMS_RELAY_WORKFORCE_URL and WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64, or neither.');
  }
  return Object.freeze({
    inboxPublicKey: inbox ? publicPem(inbox, 'CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64') : null,
    outbound: target && signing ? { targetOrigin: relayOrigin(target, 'workforce-api'), privateKey: privatePem(signing, 'WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64') } : null,
    intervalMs: relayInterval(environment.CMMS_RELAY_INTERVAL_MS, 'CMMS_RELAY_INTERVAL_MS'),
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
