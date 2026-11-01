import { createPrivateKey, randomUUID } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import { SubmitCalibrationRecordV1Schema, holdsPermission } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, HttpException, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException, type MobileRequest } from './mobile-auth.service.js';

// WI-OI-134 M-CAL: the mobile Calibration adapter. The mobile bearer is checked against the current control-plane
// session; CMMS must be enabled for the workspace and the member must hold cmms.calibration.execute. Each call reaches
// CMMS with a 60-second context signed for CMMS only; CMMS re-checks permission, scope and every reading.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CMMS_MODULE_KEY = 'asset-maintenance';
const CMMS_AUDIENCE = 'gigalibs-cmms-api';
const EXECUTE = 'cmms.calibration.execute';

type RequestHeaders = Record<string, string | string[] | undefined>;
const single = (headers: RequestHeaders, name: string) =>
  typeof headers[name] === 'string' ? (headers[name] as string) : undefined;
const requestFrom = (headers: RequestHeaders): MobileRequest => {
  const authorization = single(headers, 'authorization');
  const installationId = single(headers, 'x-gigalibs-installation-id');
  const appVersion = single(headers, 'x-gigalibs-app-version');
  return {
    ...(authorization ? { authorization } : {}),
    ...(installationId ? { installationId } : {}),
    ...(appVersion ? { appVersion } : {}),
  };
};

@Public()
@Controller('mobile/calibration')
export class MobileCalibrationController {
  private readonly logger = new Logger(MobileCalibrationController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('instruments')
  @Header('Cache-Control', 'no-store')
  instruments(@Headers() headers: RequestHeaders) {
    return this.answer(() => this.forward(headers, 'GET', '/v1/calibration/instruments'));
  }

  @Get('instruments/:id/bundle')
  @Header('Cache-Control', 'no-store')
  bundle(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.answer(() => this.forward(headers, 'GET', `/v1/calibration/instruments/${id}/bundle`));
  }

  @Post('records')
  @Header('Cache-Control', 'no-store')
  submit(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const body = SubmitCalibrationRecordV1Schema.safeParse(raw);
    if (!body.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.answer(() => this.forward(headers, 'POST', '/v1/calibration/records', body.data));
  }

  @Get('records/:id')
  @Header('Cache-Control', 'no-store')
  record(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.answer(() => this.forward(headers, 'GET', `/v1/calibration/records/${id}`));
  }

  private uuid(id: string) {
    if (!UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private async forward(headers: RequestHeaders, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const subject = await this.mobile.moduleSubject(requestFrom(headers));
    if (!subject.tenant || !subject.tenant.entitlements.some((item) =>
      item.moduleKey === CMMS_MODULE_KEY && item.status === 'ENABLED') || !holdsPermission(subject.permissions, EXECUTE))
      throw new MobileProblemException('MOBILE_SCOPE_DENIED');
    const upstream = process.env['CMMS_API_URL']?.trim();
    const encodedKey = process.env['CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64']?.trim();
    if (!upstream || !encodedKey) throw new MobileProblemException('MOBILE_UNAVAILABLE');
    let url: URL;
    let privateKey: string;
    try {
      url = new URL(upstream);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error('invalid upstream');
      privateKey = createPrivateKey({ key: Buffer.from(encodedKey, 'base64'), format: 'der', type: 'pkcs8' })
        .export({ format: 'pem', type: 'pkcs8' })
        .toString();
    } catch {
      throw new MobileProblemException('MOBILE_UNAVAILABLE');
    }
    const token = signPlatformContextToken(
      buildPlatformContext(subject, CMMS_MODULE_KEY, CMMS_AUDIENCE, { ttlSeconds: 60 }),
      privateKey,
    );
    const target = new URL(`${url.pathname.replace(/\/$/, '')}${path}`, url.origin);
    let response: Response;
    try {
      response = await fetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, application/problem+json',
          'X-Correlation-Id': single(headers, 'x-correlation-id') ?? randomUUID(),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MobileProblemException(error instanceof Error && error.name === 'TimeoutError'
        ? 'MOBILE_UPSTREAM_TIMEOUT' : 'MOBILE_UNAVAILABLE');
    }
    const value: unknown = await response.json().catch(() => null);
    if (response.ok && value && typeof value === 'object') return value;
    if (response.status === 409) throw new MobileProblemException('MOBILE_CALIBRATION_CONFLICT');
    if (response.status === 400 || response.status === 422) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    if (response.status === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
    if (response.status === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
    if (response.status === 404) throw new MobileProblemException('MOBILE_NOT_FOUND');
    this.logger.warn(`CMMS returned status ${response.status} to a mobile calibration call.`);
    throw new MobileProblemException('MOBILE_UNAVAILABLE');
  }

  private async answer<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof MobileProblemException) throw error;
      if (error instanceof HttpException && error.getStatus() === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
      if (error instanceof HttpException && error.getStatus() === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
      this.logger.error(`Mobile calibration request failed: ${error instanceof Error ? error.name : 'UnknownError'}`);
      throw new MobileProblemException('MOBILE_UNAVAILABLE');
    }
  }
}
