import { Injectable } from '@nestjs/common';
import { ConnectorFailure } from './connector-errors.js';

export interface ConnectorCredential {
  id?: string;
  provider: 'DEPLOYMENT_SECRET' | 'EXTERNAL_VAULT';
  reference: string;
  authType:
    | 'NONE'
    | 'BEARER_TOKEN'
    | 'API_KEY_HEADER'
    | 'HMAC_SHA256'
    | 'USERNAME_PASSWORD';
  headerName: string | null;
  status: 'ACTIVE' | 'INVALID' | 'REVOKED';
}

@Injectable()
export class ConnectorCredentialService {
  resolveSecret(credential: ConnectorCredential | null): string {
    if (!credential || credential.authType === 'NONE') {
      throw new ConnectorFailure(
        'CREDENTIAL_REQUIRED',
        'This connector requires an active credential reference.',
      );
    }
    if (credential.status !== 'ACTIVE') {
      throw new ConnectorFailure(
        'CREDENTIAL_INACTIVE',
        'The selected credential reference is not active.',
      );
    }
    if (credential.provider !== 'DEPLOYMENT_SECRET') {
      throw new ConnectorFailure(
        'CREDENTIAL_PROVIDER_UNAVAILABLE',
        'The configured credential provider is not enabled in this deployment.',
      );
    }
    const variableName = credential.reference.match(/^env:\/\/([A-Z][A-Z0-9_]*)$/)?.[1];
    if (!variableName) {
      throw new ConnectorFailure(
        'CREDENTIAL_REFERENCE_INVALID',
        'The deployment secret reference is invalid.',
      );
    }
    const secret = process.env[variableName];
    if (!secret) {
      throw new ConnectorFailure(
        'CREDENTIAL_NOT_RESOLVED',
        'The referenced deployment secret is unavailable.',
      );
    }
    return secret;
  }

  resolveUsernamePassword(credential: ConnectorCredential | null): {
    username: string;
    password: string;
  } {
    if (credential?.authType !== 'USERNAME_PASSWORD') {
      throw new ConnectorFailure(
        'CREDENTIAL_TYPE_MISMATCH',
        'The PostgreSQL connector requires a username/password credential reference.',
      );
    }
    const secret = this.resolveSecret(credential);
    let parsed: unknown;
    try {
      parsed = JSON.parse(secret);
    } catch {
      throw new ConnectorFailure(
        'CREDENTIAL_FORMAT_INVALID',
        'The database credential secret must be a JSON object.',
      );
    }
    if (!this.isRecord(parsed)) {
      throw new ConnectorFailure(
        'CREDENTIAL_FORMAT_INVALID',
        'The database credential secret must be a JSON object.',
      );
    }
    const keys = Object.keys(parsed).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== 'password' ||
      keys[1] !== 'username' ||
      typeof parsed.username !== 'string' ||
      parsed.username.length === 0 ||
      parsed.username.length > 128 ||
      typeof parsed.password !== 'string' ||
      parsed.password.length === 0 ||
      parsed.password.length > 4_096
    ) {
      throw new ConnectorFailure(
        'CREDENTIAL_FORMAT_INVALID',
        'The database credential secret must contain only non-empty username and password strings.',
      );
    }
    return { username: parsed.username, password: parsed.password };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
}
