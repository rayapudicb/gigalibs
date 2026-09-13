import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { OidcDevService } from './oidc-dev.service.js';

interface RedirectResponse {
  redirect(url: string): void;
  redirect(status: number, url: string): void;
}

@Controller('oidc')
export class OidcDevController {
  constructor(@Inject(OidcDevService) private readonly oidc: OidcDevService) {}

  @Get('.well-known/openid-configuration')
  getOpenIdConfiguration(): object {
    return this.oidc.getDiscoveryDocument();
  }

  @Get('jwks.json')
  getJwks(): object {
    return this.oidc.getJwks();
  }

  @Get('auth')
  authorize(
    @Query('client_id') clientId: string | undefined,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('state') state: string | undefined,
    @Query('nonce') nonce: string | undefined,
    @Query('code_challenge') codeChallenge: string | undefined,
    @Query('code_challenge_method') codeChallengeMethod: string | undefined,
    @Query('tenant_id') tenantId: string | undefined,
    @Query('sub') sub: string | undefined,
    @Res() res: RedirectResponse,
  ): void {
    if (!redirectUri) {
      throw new BadRequestException('Missing redirect_uri.');
    }

    const code = this.oidc.createAuthCode({
      clientId: clientId ?? 'unknown',
      redirectUri,
      nonce,
      codeChallenge,
      codeChallengeMethod,
      tenantId,
      sub,
    });

    const targetUrl = new URL(redirectUri);
    targetUrl.searchParams.set('code', code);
    if (state) targetUrl.searchParams.set('state', state);
    res.redirect(302, targetUrl.toString());
  }

  @Post('token')
  @HttpCode(200)
  async token(
    @Body() body: Record<string, string | undefined>,
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<object> {
    if (body.grant_type === 'client_credentials') {
      return this.oidc.issueClientCredentialsToken(body.tenant_id, body.sub);
    }

    const code = body.code;
    if (!code) {
      throw new BadRequestException('Missing code parameter.');
    }

    let clientId = body.client_id;
    if (!clientId && authHeader?.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const [id] = decoded.split(':');
        clientId = id;
      } catch {
        // Fallback
      }
    }

    return this.oidc.exchangeCode({
      code,
      codeVerifier: body.code_verifier,
      clientId,
    });
  }

  @Get('userinfo')
  userinfo(): object {
    return this.oidc.getUserInfo('dev-admin');
  }
}
