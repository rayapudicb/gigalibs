import { sha256, generateSecureToken, generateId } from '@gigalibs/crypto';
import type { GeneratedApiKey, ApiKeyRecord } from './types.js';

export class ApiKeyManager {
  /**
   * Generates a new API key formatted like: giga_live_xxxx...
   */
  static generate(tenantId: string, name: string, scopes: string[] = ['*'], ttlDays?: number): GeneratedApiKey {
    const rawSecret = generateSecureToken(32);
    const prefix = `giga_live_${rawSecret.substring(0, 6)}`;
    const fullRawKey = `${prefix}_${rawSecret.substring(6)}`;
    const keyHash = sha256(fullRawKey);

    const record: ApiKeyRecord = {
      id: generateId(),
      tenantId,
      name,
      prefix,
      keyHash,
      scopes,
      expiresAt: ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null,
      createdAt: new Date(),
    };

    return {
      rawKey: fullRawKey,
      record,
    };
  }

  static verify(rawKey: string, storedRecord: ApiKeyRecord): boolean {
    if (storedRecord.expiresAt && Date.now() > storedRecord.expiresAt.getTime()) {
      return false;
    }
    const computedHash = sha256(rawKey);
    return computedHash === storedRecord.keyHash;
  }
}
