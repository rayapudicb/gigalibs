import { AssetTagRefV1Schema, ReservePartV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-136 M-BOM: the mobile visual-spares adapter. Diagrams and stock need cmms.bom.read; reserving needs
// cmms.parts.reserve. A scanned asset tag arrives as a body and becomes CMMS's resolve query here.
@Public()
@Controller('mobile/spares')
export class MobileSparesController {
  private readonly logger = new Logger(MobileSparesController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Post('resolve')
  @Header('Cache-Control', 'no-store')
  resolve(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const tag = AssetTagRefV1Schema.safeParse(raw);
    if (!tag.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const query = new URLSearchParams({ kind: tag.data.kind, value: tag.data.value });
    return this.call(headers, 'GET', `/v1/asset-tags/resolve?${query.toString()}`, 'cmms.bom.read');
  }

  @Get('assets/:id/diagrams')
  @Header('Cache-Control', 'no-store')
  diagrams(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/assets/${id}/diagrams`, 'cmms.bom.read');
  }

  @Get('assets/:id/work-orders')
  @Header('Cache-Control', 'no-store')
  workOrders(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/assets/${id}/open-work-orders`, 'cmms.parts.reserve');
  }

  @Get('diagrams/:id')
  @Header('Cache-Control', 'no-store')
  detail(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/diagrams/${id}`, 'cmms.bom.read');
  }

  @Get('diagrams/:id/image')
  @Header('Cache-Control', 'no-store')
  image(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/diagrams/${id}/image`, 'cmms.bom.read');
  }

  @Post('reservations')
  @Header('Cache-Control', 'no-store')
  reserve(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!ReservePartV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/part-reservations', 'cmms.parts.reserve', raw);
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile spares request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_SPARES_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
