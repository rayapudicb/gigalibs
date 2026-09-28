import { Inject, Injectable, type OnModuleInit, NotFoundException } from '@nestjs/common';
import * as jose from 'jose';
import { TAX_CONFIG } from '../config.provider.js';
import type { TaxRuntimeConfig } from '../runtime-config.js';

const DEFAULT_DEV_TENANT_ID = '10000000-0000-4000-8000-000000000001';
const DEFAULT_DEV_SUB = 'dev-tax-admin';

@Injectable()
export class OidcDevService implements OnModuleInit {
  private privateKey!: jose.CryptoKey;
  private publicKeyJwk!: jose.JWK;

  constructor(@Inject(TAX_CONFIG) private readonly config: TaxRuntimeConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.allowInsecureOidc) return;
    const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { modulusLength: 2048 });
    this.privateKey = privateKey;
    const jwk = await jose.exportJWK(publicKey);
    jwk.kid = 'tax-dev-key-1';
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
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      scopes_supported: ['openid', 'profile', 'email'],
    };
  }

  getJwks(): { keys: jose.JWK[] } {
    this.assertEnabled();
    return { keys: [this.publicKeyJwk] };
  }

  async issueToken(tenantId = DEFAULT_DEV_TENANT_ID, subject = DEFAULT_DEV_SUB): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    this.assertEnabled();
    const now = Math.floor(Date.now() / 1000);
    const permissions = [
      'tax.settings.manage',
      'tax.jurisdictions.read',
      'tax.jurisdictions.write',
      'tax.rates.read',
      'tax.rates.write',
      'tax.exemptions.read',
      'tax.exemptions.write',
      'tax.exemptions.verify',
      'tax.calculate',
      'tax.ledger.read',
      'tax.monitor.read',
    ];

    const jwt = await new jose.SignJWT({
      [this.config.tenantClaim]: tenantId,
      [this.config.permissionsClaim]: permissions,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'tax-dev-key-1' })
      .setIssuedAt(now)
      .setIssuer(this.config.oidcIssuer)
      .setAudience(this.config.oidcAudience)
      .setSubject(subject)
      .setExpirationTime(now + 86400)
      .sign(this.privateKey);

    return {
      access_token: jwt,
      token_type: 'Bearer',
      expires_in: 86400,
    };
  }
}
