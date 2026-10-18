import { createPrivateKey, createPublicKey } from 'node:crypto';

/** ADR-0007 option A settings for one side of a module-to-module relay. */
export interface RelayConfig {
  /** Verifies relay tokens from the peer; the inbox answers 503 when absent. */
  readonly inboxPublicKey: string | null;
  /** Delivers this module's facts to the peer inbox; the relay is off when absent. */
  readonly outbound: {
    readonly targetOrigin: string;
    readonly privateKey: string;
    /** Inbox POST path on the peer origin (module-host modules need their base path). */
    readonly inboxPath: string;
  } | null;
  readonly intervalMs: number;
}

/** The environment variable names a module reads its relay settings from, and the peer's Compose service. */
export interface RelayConfigNames {
  readonly inboxPublicKey: string;
  readonly targetUrl: string;
  readonly signingKey: string;
  readonly interval: string;
  readonly peerService: string;
  /** Optional env var for the inbox path; defaults to `/internal/v1/inbox`. */
  readonly inboxPath?: string;
}

export function loadRelayConfig(
  environment: NodeJS.ProcessEnv,
  names: RelayConfigNames,
): RelayConfig {
  const inbox = environment[names.inboxPublicKey]?.trim();
  const target = environment[names.targetUrl]?.trim();
  const signing = environment[names.signingKey]?.trim();
  if ((target ? 1 : 0) + (signing ? 1 : 0) === 1) {
    throw new Error(`Set both ${names.targetUrl} and ${names.signingKey}, or neither.`);
  }
  return Object.freeze({
    inboxPublicKey: inbox ? publicPem(inbox, names.inboxPublicKey) : null,
    outbound:
      target && signing
        ? {
            targetOrigin: relayOrigin(target, names.peerService),
            privateKey: privatePem(signing, names.signingKey),
            inboxPath: relayInboxPath(environment, names.inboxPath),
          }
        : null,
    intervalMs: relayInterval(environment[names.interval], names.interval),
  });
}

function relayInboxPath(environment: NodeJS.ProcessEnv, name: string | undefined): string {
  const raw = name ? environment[name]?.trim() : '';
  const path = raw || '/internal/v1/inbox';
  if (!path.startsWith('/') || path.includes('..') || path.includes('://')) {
    throw new Error(`${name ?? 'inboxPath'} must be an absolute path such as /financial-operations/internal/v1/inbox.`);
  }
  return path;
}

function relayInterval(raw: string | undefined, name: string): number {
  const value = raw?.trim() ? Number(raw.trim()) : 1_000;
  if (!Number.isInteger(value) || value < 100 || value > 60_000) {
    throw new Error(`${name} must be an integer between 100 and 60000.`);
  }
  return value;
}

/** Only a loopback or the peer's Compose service origin, without credentials or a path. */
export function relayOrigin(raw: string, serviceHostname: string): string {
  const url = new URL(raw);
  const allowed = ['localhost', '127.0.0.1', '::1', '[::1]', serviceHostname].includes(
    url.hostname,
  );
  if (
    !allowed ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`The relay target must be the ${serviceHostname} service origin.`);
  }
  return url.origin;
}

function publicPem(base64: string, name: string): string {
  try {
    const key = createPublicKey({
      key: Buffer.from(base64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error(`${name} must be an Ed25519 public key.`);
  }
}

function privatePem(base64: string, name: string): string {
  try {
    const key = createPrivateKey({
      key: Buffer.from(base64, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('type');
    return key.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch {
    throw new Error(`${name} must be an Ed25519 private key.`);
  }
}
