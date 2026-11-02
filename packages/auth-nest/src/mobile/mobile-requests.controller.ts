import { AssetTagRefV1Schema, ReportProblemV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-140 M-REQ: signed-in problem reports from the mobile app (cmms.requests.report: its own permission, so the
// core request permissions stay checked by CMMS alone). A scanned tag arrives as a body; a report is idempotent per
// member and operation in CMMS.
@Public()
@Controller('mobile/requests')
export class MobileRequestsController {
  private readonly logger = new Logger(MobileRequestsController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Post('resolve')
  @Header('Cache-Control', 'no-store')
  resolve(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const tag = AssetTagRefV1Schema.safeParse(raw);
    if (!tag.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    const query = new URLSearchParams({ kind: tag.data.kind, value: tag.data.value });
    return this.call(headers, 'GET', `/v1/asset-tags/resolve?${query.toString()}`);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  report(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!ReportProblemV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/request-reports', raw);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  mine(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/request-reports/mine');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile report request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission: 'cmms.requests.report', conflict: 'MOBILE_REPORT_CONFLICT',
      logger: this.logger, ...(body === undefined ? {} : { body }),
    }));
  }
}
