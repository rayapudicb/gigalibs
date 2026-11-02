import {
  GasTestV1InputSchema,
  LockIsolationV1Schema,
  PermitVersionV1Schema,
  RequestPermitV1Schema,
  VerifyIsolationV1Schema,
} from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

const POINT_KEY = /^[a-z][a-z0-9-]{0,31}$/;
type Schema = { safeParse(value: unknown): { success: boolean } };

// WI-OI-142 M-LOTO: the mobile permit adapter. Reading needs cmms.permits.read; requesting, isolating, gas testing and
// de-isolating need cmms.permits.request; personal lock on/off needs cmms.permits.lock. Approval stays on the web.
@Public()
@Controller('mobile/permits')
export class MobilePermitsController {
  private readonly logger = new Logger(MobilePermitsController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  mine(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/permits?mine=true', 'cmms.permits.read');
  }

  @Get('procedures')
  @Header('Cache-Control', 'no-store')
  procedures(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/isolation-procedures?status=PUBLISHED', 'cmms.permits.read');
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  request(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    this.valid(RequestPermitV1Schema, raw);
    return this.call(headers, 'POST', '/v1/permits', 'cmms.permits.request', raw);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  permit(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/permits/${id}`, 'cmms.permits.read');
  }

  @Post(':id/points/:key/lock')
  @Header('Cache-Control', 'no-store')
  lock(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('key') key: string, @Body() raw: unknown) {
    return this.point(headers, id, key, 'lock', LockIsolationV1Schema, raw);
  }

  @Post(':id/points/:key/verify')
  @Header('Cache-Control', 'no-store')
  verify(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('key') key: string, @Body() raw: unknown) {
    return this.point(headers, id, key, 'verify', VerifyIsolationV1Schema, raw);
  }

  @Post(':id/points/:key/remove')
  @Header('Cache-Control', 'no-store')
  remove(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('key') key: string, @Body() raw: unknown) {
    return this.point(headers, id, key, 'remove', PermitVersionV1Schema, raw);
  }

  @Post(':id/gas-tests')
  @Header('Cache-Control', 'no-store')
  gasTest(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    this.valid(GasTestV1InputSchema, raw);
    return this.call(headers, 'POST', `/v1/permits/${id}/gas-tests`, 'cmms.permits.request', raw);
  }

  @Post(':id/lock-on')
  @Header('Cache-Control', 'no-store')
  lockOn(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'POST', `/v1/permits/${id}/lock-on`, 'cmms.permits.lock', {});
  }

  @Post(':id/lock-off')
  @Header('Cache-Control', 'no-store')
  lockOff(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'POST', `/v1/permits/${id}/lock-off`, 'cmms.permits.lock', {});
  }

  @Post(':id/de-isolate')
  @Header('Cache-Control', 'no-store')
  deIsolate(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    this.valid(PermitVersionV1Schema, raw);
    return this.call(headers, 'POST', `/v1/permits/${id}/de-isolate`, 'cmms.permits.request', raw);
  }

  private point(headers: RequestHeaders, id: string, key: string, action: string, schema: Schema, raw: unknown) {
    this.uuid(id);
    if (!POINT_KEY.test(key)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    this.valid(schema, raw);
    return this.call(headers, 'POST', `/v1/permits/${id}/points/${key}/${action}`, 'cmms.permits.request', raw);
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private valid(schema: Schema, raw: unknown) {
    if (!schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile permit request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_PERMIT_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
