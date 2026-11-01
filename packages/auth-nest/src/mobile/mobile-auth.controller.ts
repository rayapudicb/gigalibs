import type { MobileProblemCode } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { MobileAuthService, MobileProblemException, type MobileRequest } from './mobile-auth.service.js';

// WI-OI-120cf: `/api/v1/mobile/*` on the control plane, reached only through the web app's `/mobile/v1` forwarder.
// The web guards do not apply (a mobile bearer is not a web token): each route checks its own mobile credential.
// Every refusal is a mobile problem (`code`, `title`, `status`), never an internal message.

type RequestHeaders = Record<string, string | string[] | undefined>;

const CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

function single(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function mobileRequest(headers: RequestHeaders): MobileRequest {
  const authorization = single(headers, 'authorization');
  const installationId = single(headers, 'x-gigalibs-installation-id');
  const idempotencyKey = single(headers, 'idempotency-key');
  const appVersion = single(headers, 'x-gigalibs-app-version');
  return {
    ...(authorization ? { authorization } : {}),
    ...(installationId ? { installationId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(appVersion ? { appVersion } : {}),
  };
}

@Public()
@Controller('mobile')
export class MobileAuthController {
  private readonly logger = new Logger(MobileAuthController.name);

  constructor(private readonly mobile: MobileAuthService) {}

  @Post('auth/password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  password(@Body() body: unknown, @Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.passwordSignIn(body, mobileRequest(headers)));
  }

  @Post('auth/mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  verifyMfa(@Body() body: unknown, @Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.verifyMfa(body, mobileRequest(headers)));
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  refresh(@Body() body: unknown, @Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.refresh(body, mobileRequest(headers)));
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async logout(@Body() body: unknown, @Headers() headers: RequestHeaders) {
    await this.answer(headers, () => this.mobile.logout(body, mobileRequest(headers)));
  }

  @Get('memberships')
  @Header('Cache-Control', 'no-store')
  memberships(@Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.memberships(mobileRequest(headers)));
  }

  @Post('session/switch')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  switchWorkspace(@Body() body: unknown, @Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.switchWorkspace(body, mobileRequest(headers)));
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  session(@Headers() headers: RequestHeaders) {
    return this.answer(headers, () => this.mobile.session(mobileRequest(headers)));
  }

  /** Runs one route; anything that is not already a mobile problem becomes one, with nothing internal in it. */
  private async answer<T>(headers: RequestHeaders, work: () => Promise<T>): Promise<T> {
    const correlation = single(headers, 'x-correlation-id');
    const correlationId = correlation && CORRELATION_ID.test(correlation) ? correlation : undefined;
    try {
      return await work();
    } catch (error) {
      let code: MobileProblemCode;
      if (error instanceof MobileProblemException) code = error.code;
      else if (error instanceof HttpException && error.getStatus() === 401) code = 'MOBILE_AUTH_REQUIRED';
      else if (error instanceof HttpException && error.getStatus() === 403) code = 'MOBILE_SCOPE_DENIED';
      else {
        this.logger.error(`Mobile request failed. error=${error instanceof Error ? error.name : 'UnknownError'}`);
        code = 'MOBILE_UNAVAILABLE';
      }
      throw new MobileProblemException(code, correlationId);
    }
  }
}
