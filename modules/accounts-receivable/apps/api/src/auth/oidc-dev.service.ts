import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit, NotFoundException } from '@nestjs/common';
import * as jose from 'jose';
import { AR_CONFIG } from '../config.provider.js';
import type { ArRuntimeConfig } from '../runtime-config.js';

interface PendingAuthCode {
  clientId: string;
  redirectUri: string;
  nonce?: string | undefined;
  codeChallenge?: string | undefined;
  codeChallengeMethod?: string | undefined;
  tenantId: string;
  sub: string;
  expiresAt: number;
}

const DEFAULT_DEV_TENANT_ID = '10000000-0000-4000-8000-000000000001';
const DEFAULT_DEV_SUB = 'dev-admin';

@Injectable()
export class OidcDevService implements OnModuleInit {
  private privateKey!: jose.CryptoKey;
  private publicKeyJwk!: jose.JWK;
  private readonly codes = new Map<string, PendingAuthCode>();

  constructor(@Inject(AR_CONFIG) private readonly config: ArRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.allowInsecureOidc) return;
    const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
    this.privateKey = privateKey;
    const jwk = await jose.exportJWK(publicKey);
    jwk.kid = 'dev-key-1';
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    this.publicKeyJwk = jwk;
  }

  private assertEnabled(): void {
    if (!this.config.allowInsecureOidc) {
      throw new NotFoundException('OIDC development provider is disabled.');
    }
  }

  getDiscoveryDocument() {
    this.assertEnabled();
    const issuer = this.config.oidcIssuer;
    return {
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks.json`,
      userinfo_endpoint: `${issuer}/userinfo`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256', 'plain'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce', this.config.tenantClaim, this.config.permissionsClaim],
    };
  }

  getJwks() {
    this.assertEnabled();
    return { keys: [this.publicKeyJwk] };
  }

  createAuthCode(params: {
    clientId: string;
    redirectUri: string;
    nonce?: string | undefined;
    codeChallenge?: string | undefined;
    codeChallengeMethod?: string | undefined;
    tenantId?: string | undefined;
    sub?: string | undefined;
  }): string {
    this.assertEnabled();
    this.cleanExpiredCodes();
    const code = randomBytes(32).toString('hex');
    this.codes.set(code, {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      nonce: params.nonce,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      tenantId: params.tenantId ?? DEFAULT_DEV_TENANT_ID,
      sub: params.sub ?? DEFAULT_DEV_SUB,
      expiresAt: Date.now() + 300_000,
    });
    return code;
  }

  async exchangeCode(params: {
    code: string;
    codeVerifier?: string | undefined;
    clientId?: string | undefined;
  }): Promise<{
    access_token: string;
    id_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
  }> {
    this.assertEnabled();
    const pending = this.codes.get(params.code);
    if (!pending || pending.expiresAt < Date.now()) {
      this.codes.delete(params.code);
      throw new Error('Invalid or expired authorization code.');
    }
    this.codes.delete(params.code);

    if (pending.codeChallenge) {
      if (!params.codeVerifier) {
        throw new Error('Code verifier required for PKCE.');
      }
      if (pending.codeChallengeMethod === 'S256') {
        const hash = createHash('sha256').update(params.codeVerifier).digest('base64url');
        if (hash !== pending.codeChallenge) {
          throw new Error('Code verifier mismatch.');
        }
      } else if (params.codeVerifier !== pending.codeChallenge) {
        throw new Error('Code verifier mismatch.');
      }
    }

    const clientId = params.clientId || pending.clientId;
    const nowSec = Math.floor(Date.now() / 1000);

    const idToken = await new jose.SignJWT({
      sub: pending.sub,
      nonce: pending.nonce ?? randomUUID(),
      name: 'Development Admin',
      email: 'admin@gigalibs.local',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'dev-key-1' })
      .setIssuer(this.config.oidcIssuer)
      .setAudience(clientId)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(this.privateKey);

    const accessToken = await new jose.SignJWT({
      sub: pending.sub,
      [this.config.tenantClaim]: pending.tenantId,
      [this.config.permissionsClaim]: [
        'ar.customers.read',
        'ar.customers.write',
        'ar.invoices.read',
        'ar.invoices.write',
        'ar.invoices.issue',
        'ar.settings.manage',
      ],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'dev-key-1' })
      .setIssuer(this.config.oidcIssuer)
      .setAudience(this.config.oidcAudience)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 3600)
      .sign(this.privateKey);

    return {
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: randomBytes(24).toString('hex'),
    };
  }

  async issueClientCredentialsToken(
    tenantId = DEFAULT_DEV_TENANT_ID,
    sub = DEFAULT_DEV_SUB,
  ): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    this.assertEnabled();
    const nowSec = Math.floor(Date.now() / 1000);
    const accessToken = await new jose.SignJWT({
      sub,
      [this.config.tenantClaim]: tenantId,
      [this.config.permissionsClaim]: [
        'ar.customers.read',
        'ar.customers.write',
        'ar.invoices.read',
        'ar.invoices.write',
        'ar.invoices.issue',
        'ar.settings.manage',
      ],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'dev-key-1' })
      .setIssuer(this.config.oidcIssuer)
      .setAudience(this.config.oidcAudience)
      .setIssuedAt(nowSec)
      .setExpirationTime(nowSec + 86400)
      .sign(this.privateKey);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 86400,
    };
  }

  getUserInfo(sub: string) {
    this.assertEnabled();
    return {
      sub,
      name: 'Development Admin',
      email: 'admin@gigalibs.local',
    };
  }

  private cleanExpiredCodes(): void {
    const now = Date.now();
    for (const [code, entry] of this.codes.entries()) {
      if (entry.expiresAt < now) this.codes.delete(code);
    }
  }
}
