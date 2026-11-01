import {
  AssetTagRefV1Schema,
  RecordAssetSightingV1Schema,
  StartAssetAuditV1Schema,
  SubmitCommissioningRequestV1Schema,
} from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-135 M-TAG: the mobile commissioning and floor-walk adapter. The web BFF forwards no query string, so a tag
// lookup arrives as a body and is turned into CMMS's resolve query here.
@Public()
@Controller('mobile/commissioning')
export class MobileCommissioningController {
  private readonly logger = new Logger(MobileCommissioningController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('context')
  @Header('Cache-Control', 'no-store')
  context(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/commissioning/context', 'cmms.commissioning.submit');
  }

  @Post('requests')
  @Header('Cache-Control', 'no-store')
  submit(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const body = SubmitCommissioningRequestV1Schema.safeParse(raw);
    if (!body.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/commissioning/requests', 'cmms.commissioning.submit', raw);
  }

  @Post('tags/resolve')
  @Header('Cache-Control', 'no-store')
  resolve(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const tag = AssetTagRefV1Schema.safeParse(raw);
    if (!tag.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const query = new URLSearchParams({ kind: tag.data.kind, value: tag.data.value });
    return this.call(headers, 'GET', `/v1/asset-tags/resolve?${query.toString()}`, 'cmms.audits.execute');
  }

  @Post('walks')
  @Header('Cache-Control', 'no-store')
  start(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!StartAssetAuditV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/asset-audits', 'cmms.audits.execute', raw);
  }

  @Post('walks/:id/sightings')
  @Header('Cache-Control', 'no-store')
  sighting(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!RecordAssetSightingV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/asset-audits/${id}/sightings`, 'cmms.audits.execute', raw);
  }

  @Post('walks/:id/finish')
  @Header('Cache-Control', 'no-store')
  finish(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'POST', `/v1/asset-audits/${id}/finish`, 'cmms.audits.execute', {});
  }

  @Get('walks/:id/report')
  @Header('Cache-Control', 'no-store')
  report(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/asset-audits/${id}/report`, 'cmms.audits.execute');
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile commissioning request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_COMMISSIONING_CONFLICT',
      logger: this.logger, ...(body === undefined ? {} : { body }),
    }));
  }
}
