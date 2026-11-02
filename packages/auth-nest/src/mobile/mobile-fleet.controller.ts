import { AssetTagRefV1Schema, CertifyFleetRepairV1Schema, GroundFleetAssetV1Schema, SubmitFleetInspectionV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-139 M-DVIR: the mobile fleet adapter. Reading needs cmms.fleet.read; inspecting and red-tagging need
// cmms.fleet.inspect; a repair certificate needs cmms.fleet.certify. A scanned tag arrives as a body.
@Public()
@Controller('mobile/fleet')
export class MobileFleetController {
  private readonly logger = new Logger(MobileFleetController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Post('resolve')
  @Header('Cache-Control', 'no-store')
  resolve(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const tag = AssetTagRefV1Schema.safeParse(raw);
    if (!tag.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const query = new URLSearchParams({ kind: tag.data.kind, value: tag.data.value });
    return this.call(headers, 'GET', `/v1/asset-tags/resolve?${query.toString()}`, 'cmms.fleet.read');
  }

  @Get('assets/:id')
  @Header('Cache-Control', 'no-store')
  asset(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/fleet/assets/${id}`, 'cmms.fleet.read');
  }

  @Post('inspections')
  @Header('Cache-Control', 'no-store')
  inspect(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!SubmitFleetInspectionV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/fleet/inspections', 'cmms.fleet.inspect', raw);
  }

  @Get('groundings')
  @Header('Cache-Control', 'no-store')
  groundings(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/fleet/groundings', 'cmms.fleet.read');
  }

  @Post('groundings')
  @Header('Cache-Control', 'no-store')
  ground(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!GroundFleetAssetV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/fleet/groundings', 'cmms.fleet.inspect', raw);
  }

  @Post('groundings/:id/certify')
  @Header('Cache-Control', 'no-store')
  certify(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!CertifyFleetRepairV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/fleet/groundings/${id}/certify`, 'cmms.fleet.certify', raw);
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile fleet request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_FLEET_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
