export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  prefix: string; // e.g. 'giga_live_7a8f'
  keyHash: string; // SHA-256 hash of the secret portion
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

export interface GeneratedApiKey {
  rawKey: string; // only shown once to user
  record: ApiKeyRecord;
}
