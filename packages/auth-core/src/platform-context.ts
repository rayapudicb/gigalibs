import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';
import {
  type OrganizationScopeV2,
  type PlatformContextAssignmentScope,
  type PlatformContextV1,
  PlatformContextV1Schema,
  determinePersona,
  encodeAssignmentGrants,
} from '@gigalibs/contracts';
export type { PlatformContextV1 };

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export class PlatformContextError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PlatformContextError';
  }
}

export function signPlatformContextToken(
  payload: PlatformContextV1,
  privateKeyPem: string,
): string {
  const parsed = PlatformContextV1Schema.safeParse(payload);
  if (!parsed.success) {
    throw new PlatformContextError(
      `Invalid platform context payload: ${parsed.error.message}`,
      'INVALID_PAYLOAD',
    );
  }

  const privateKey = parseEd25519PrivateKey(privateKeyPem);
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = signBytes(null, Buffer.from(data), privateKey).toString('base64url');

  return `${data}.${signature}`;
}

export function verifyPlatformContextToken(
  token: string,
  publicKeyPem: string,
  expectedAudience: string,
): PlatformContextV1 {
  if (!token || typeof token !== 'string') {
    throw new PlatformContextError(
      'Missing or malformed platform context token.',
      'MISSING_TOKEN',
    );
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new PlatformContextError('Token structure is invalid.', 'INVALID_FORMAT');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new PlatformContextError('Token parts are missing.', 'INVALID_FORMAT');
  }

  const data = `${encodedHeader}.${encodedPayload}`;
  const signatureBytes = Buffer.from(signature, 'base64url');
  const publicKey = parseEd25519PublicKey(publicKeyPem);
  if (!verifyBytes(null, Buffer.from(data), publicKey, signatureBytes)) {
    throw new PlatformContextError('Token signature verification failed.', 'INVALID_SIGNATURE');
  }

  let rawHeader: Record<string, unknown>;
  let rawPayload: Record<string, unknown>;
  try {
    rawHeader = JSON.parse(base64UrlDecode(encodedHeader));
    rawPayload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new PlatformContextError('Token contains unparseable JSON.', 'MALFORMED_JSON');
  }

  if (rawHeader['alg'] !== 'EdDSA' || rawHeader['typ'] !== 'JWT') {
    throw new PlatformContextError('Unsupported token algorithm or type.', 'INVALID_HEADER');
  }

  const parsed = PlatformContextV1Schema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new PlatformContextError(
      `Token payload validation failed: ${parsed.error.message}`,
      'INVALID_CLAIMS',
    );
  }

  const context = parsed.data;
  const now = Math.floor(Date.now() / 1000);

  if (context.iss !== 'gigalibs-control-plane') {
    throw new PlatformContextError(
      `Invalid token issuer: '${context.iss}'. Expected 'gigalibs-control-plane'.`,
      'WRONG_ISSUER',
    );
  }

  if (context.aud !== expectedAudience) {
    throw new PlatformContextError(
      `Invalid token audience: '${context.aud}'. Expected '${expectedAudience}'.`,
      'WRONG_AUDIENCE',
    );
  }

  if (context.exp <= now) {
    throw new PlatformContextError('Platform context token has expired.', 'EXPIRED_TOKEN');
  }

  if (context.iat > now + 5) {
    throw new PlatformContextError('Platform context token issued in the future.', 'FUTURE_TOKEN');
  }

  return context;
}

function normalizePem(value: string): string {
  return value.trim().replaceAll('\\n', '\n');
}

function parseEd25519PrivateKey(value: string) {
  if (!value?.trim()) {
    throw new PlatformContextError(
      'Platform context Ed25519 private key is not configured.',
      'INVALID_PRIVATE_KEY',
    );
  }
  try {
    const key = createPrivateKey(normalizePem(value));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new PlatformContextError(
      'Platform context signing key must be an Ed25519 private PEM key.',
      'INVALID_PRIVATE_KEY',
    );
  }
}

function parseEd25519PublicKey(value: string) {
  if (!value?.trim()) {
    throw new PlatformContextError(
      'Platform context Ed25519 public key is not configured.',
      'INVALID_PUBLIC_KEY',
    );
  }
  try {
    const key = createPublicKey(normalizePem(value));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new PlatformContextError(
      'Platform context verification key must be an Ed25519 public PEM key.',
      'INVALID_PUBLIC_KEY',
    );
  }
}

/** The verified facts a module context is built from: a live session (web) or a schedule owner (kernel worker). */
export interface PlatformContextSubject {
  readonly user: { readonly id: string };
  readonly tenant: {
    readonly id: string;
    readonly entitlements: readonly { readonly moduleKey: string; readonly status: string; readonly version: string }[];
  } | null;
  readonly roles: readonly string[];
  readonly platformRoles: readonly string[];
  readonly permissions: readonly string[];
  readonly authVersion: number;
  readonly session?: { readonly id: string } | null;
  readonly orgScope: { readonly mode: 'FLAT_TENANT' } | { readonly mode: 'SCOPED_DEPARTMENTS'; readonly departmentIds: readonly string[] };
  readonly spatialScope: { readonly mode: 'UNBOUNDED' } | { readonly mode: 'SCOPED_PLACES'; readonly placeIds: readonly string[] };
  /** Present once the tenant's primary tree has a version in force (WI-OI-109e). */
  readonly organizationScope?: OrganizationScopeV2 | null;
  /**
   * WI-OI-120w (R2 slice 3): the member's assignments (the base role first), each with its permissions and scope.
   * Absent for a subject resolved before this field existed; the context then carries no assignment claim.
   */
  readonly assignments?: readonly {
    readonly permissions: readonly string[];
    readonly scope: PlatformContextAssignmentScope;
  }[] | null;
}

/**
 * The one builder of module PlatformContextV1 claims (WI-OI-104c), shared by the web BFF and the kernel worker: the
 * module must be actively entitled, the lifetime is at most 300 s, and persona, organisation and place scope come
 * from the subject.
 */
export function buildPlatformContext(
  subject: PlatformContextSubject,
  moduleKey: string,
  audience: string,
  options: { readonly ttlSeconds?: number; readonly nowSeconds?: number } = {},
): PlatformContextV1 {
  if (!subject.tenant) throw new Error('Cannot mint module context token without an active tenant workspace.');
  const entitlement = subject.tenant.entitlements.find(
    (candidate) => candidate.moduleKey === moduleKey && candidate.status === 'ENABLED',
  );
  if (!entitlement) throw new Error(`Module '${moduleKey}' is not actively entitled for this workspace.`);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(options.ttlSeconds ?? 300, 300);
  const grantedScopes = [...subject.permissions];
  return {
    iss: 'gigalibs-control-plane',
    aud: audience,
    sub: subject.user.id,
    tenant_id: subject.tenant.id,
    session_id: subject.session?.id ?? randomUUID(),
    auth_version: subject.authVersion,
    roles: [...subject.roles],
    granted_scopes: grantedScopes,
    persona_type: determinePersona([...subject.roles], [...subject.platformRoles]),
    org_scope:
      subject.orgScope.mode === 'SCOPED_DEPARTMENTS'
        ? { mode: 'SCOPED_DEPARTMENTS', department_ids: [...subject.orgScope.departmentIds] }
        : { mode: 'FLAT_TENANT' },
    spatial_scope:
      subject.spatialScope.mode === 'SCOPED_PLACES'
        ? { mode: 'SCOPED_PLACES', place_ids: [...subject.spatialScope.placeIds] }
        : { mode: 'UNBOUNDED' },
    ...(subject.organizationScope ? { organization: organizationClaim(subject.organizationScope) } : {}),
    // ADR-0034 §5: each assignment names its permissions among `granted_scopes` (never more) and where they apply.
    ...(subject.assignments
      ? {
          assignments: {
            version: 1 as const,
            items: subject.assignments.map((assignment) => ({
              grants: encodeAssignmentGrants(grantedScopes, assignment.permissions),
              scope: assignmentScopeClaim(assignment.scope),
            })),
          },
        }
      : {}),
    entitlement: { module_key: moduleKey, status: 'ENABLED', version: entitlement.version },
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
  };
}

function assignmentScopeClaim(scope: PlatformContextAssignmentScope): PlatformContextAssignmentScope {
  if (scope.kind === 'UNITS') return { kind: 'UNITS', tree_version: scope.tree_version, unit_ids: [...scope.unit_ids] };
  if (scope.kind === 'PLACES') return { kind: 'PLACES', place_ids: [...scope.place_ids] };
  return { kind: scope.kind };
}

function organizationClaim(scope: OrganizationScopeV2): OrganizationScopeV2 {
  if (scope.mode === 'UNITS')
    return { mode: 'UNITS', tree_version: scope.tree_version, read_roots: [...scope.read_roots], write_roots: [...scope.write_roots] };
  if (scope.mode === 'TENANT') return scope.tree_version ? { mode: 'TENANT', tree_version: scope.tree_version } : { mode: 'TENANT' };
  return { mode: 'DENIED' };
}
