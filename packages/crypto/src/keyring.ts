const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_PREVIOUS_KEYS = 16;

function requireKeyVersion(value: string, label: string): string {
  const normalized = value.trim();
  if (!KEY_VERSION_PATTERN.test(normalized)) {
    throw new Error(`${label} must contain 1-100 letters, digits, dots, underscores, or hyphens.`);
  }
  return normalized;
}

function requireCanonicalAes256Key(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a base64 string.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    throw new Error(`${label} must be a canonical base64-encoded 32-byte key.`);
  }
  return value;
}

/**
 * Builds the bounded decryption key ring used during an AES-256 key rotation.
 * The active key is always present and old keys can only decrypt existing data;
 * callers must continue to encrypt new data with the active version.
 */
export function parseAes256KeyRing(
  currentVersion: string,
  currentKeyBase64: string,
  previousKeysJson?: string,
): ReadonlyMap<string, string> {
  const activeVersion = requireKeyVersion(currentVersion, 'Current encryption key version');
  const activeKey = requireCanonicalAes256Key(currentKeyBase64, 'Current encryption key');
  const keyRing = new Map<string, string>([[activeVersion, activeKey]]);

  if (!previousKeysJson?.trim()) return keyRing;

  let parsed: unknown;
  try {
    parsed = JSON.parse(previousKeysJson);
  } catch {
    throw new Error('Previous encryption keys must be a valid JSON object.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Previous encryption keys must be a JSON object keyed by version.');
  }
  const entries = Object.entries(parsed);
  if (entries.length > MAX_PREVIOUS_KEYS) {
    throw new Error(
      `Previous encryption keys cannot contain more than ${MAX_PREVIOUS_KEYS} entries.`,
    );
  }
  for (const [rawVersion, rawKey] of entries) {
    const version = requireKeyVersion(rawVersion, 'Previous encryption key version');
    if (version === activeVersion) {
      throw new Error('Previous encryption keys cannot redefine the active key version.');
    }
    keyRing.set(version, requireCanonicalAes256Key(rawKey, `Previous encryption key '${version}'`));
  }
  return keyRing;
}

export function requireAes256KeyVersion(
  keyRing: ReadonlyMap<string, string>,
  version: string,
): string {
  const key = keyRing.get(version);
  if (!key) throw new Error(`Encryption key version '${version}' is not loaded.`);
  return key;
}
