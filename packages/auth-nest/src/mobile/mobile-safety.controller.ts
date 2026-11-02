import { ReportHazardV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, SAFETY_TARGET, answerMobile, forwardMobileModule } from './mobile-cmms-forward.js';

// WI-OI-141 M-INC: the mobile safety adapter. Reporting, own reports and open stop-work alerts need
// safety-operations.hazards.report; acknowledging an alert needs safety-operations.stop-work.acknowledge. Safety
// Operations (a hosted module) re-checks everything.
@Public()
@Controller('mobile/safety')
export class MobileSafetyController {
  private readonly logger = new Logger(MobileSafetyController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Post('reports')
  @Header('Cache-Control', 'no-store')
  report(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!ReportHazardV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/hazards', 'safety-operations.hazards.report', raw);
  }

  @Get('reports/mine')
  @Header('Cache-Control', 'no-store')
  mine(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/hazards/mine', 'safety-operations.hazards.report');
  }

  @Get('stop-work')
  @Header('Cache-Control', 'no-store')
  alerts(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/stop-work', 'safety-operations.hazards.report');
  }

  @Post('stop-work/:id/acknowledge')
  @Header('Cache-Control', 'no-store')
  acknowledge(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/stop-work/${id}/acknowledge`, 'safety-operations.stop-work.acknowledge', {});
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile safety request', () => forwardMobileModule(SAFETY_TARGET, {
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_SAFETY_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
