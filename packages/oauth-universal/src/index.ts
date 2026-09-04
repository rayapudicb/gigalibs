/**
 * @gigalibs/oauth-universal
 *
 * Universal OAuth2 & OpenID Connect (OIDC) client suite.
 * Supports Google, Microsoft, GitHub, Apple, and Authorization Code Flow with PKCE.
 *
 * @module
 */

import { getRandomBytes, bytesToBase64Url, sha256Bytes } from '@gigalibs/crypto';

export type OAuthProviderName = 'google' | 'github' | 'microsoft' | 'apple' | 'discord' | 'slack';

export interface OAuthClientConfig {
  provider: OAuthProviderName;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export class UniversalOAuthClient {
  private static endpoints: Record<OAuthProviderName, { authUrl: string; tokenUrl: string; userUrl: string }> = {
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    },
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userUrl: 'https://api.github.com/user',
    },
    microsoft: {
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userUrl: 'https://graph.microsoft.com/v1.0/me',
    },
    apple: {
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      userUrl: 'https://appleid.apple.com/auth/userinfo',
    },
    discord: {
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      userUrl: 'https://discord.com/api/users/@me',
    },
    slack: {
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      userUrl: 'https://slack.com/api/users.identity',
    },
  };

  /**
   * Generates PKCE code_verifier and SHA-256 code_challenge (Browser & Node.js).
   */
  static generatePkce(): PkcePair {
    const verifierBytes = getRandomBytes(32);
    const codeVerifier = bytesToBase64Url(verifierBytes);
    const codeChallenge = bytesToBase64Url(sha256Bytes(codeVerifier));
    return { codeVerifier, codeChallenge };
  }

  /**
   * Generates the OAuth authorization URL for the user to login.
   */
  static getAuthorizationUrl(config: OAuthClientConfig, state: string, pkce?: PkcePair): string {
    const ep = this.endpoints[config.provider];
    if (!ep) throw new Error(`Unknown OAuth provider: ${config.provider}`);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      ...(pkce ? { code_challenge: pkce.codeChallenge, code_challenge_method: 'S256' } : {}),
    });

    return `${ep.authUrl}?${params.toString()}`;
  }
}
