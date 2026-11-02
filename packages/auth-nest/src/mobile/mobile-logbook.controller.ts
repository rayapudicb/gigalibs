import {
  AcceptHandoverV1Schema,
  CreateLogEntryV1Schema,
  RequestBypassV1Schema,
  SubmitHandoverV1Schema,
} from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, WORKFORCE_TARGET, answerMobile, forwardMobileModule } from './mobile-cmms-forward.js';

// WI-OI-137 M-LOG: the mobile shift-logbook adapter. Reading needs workforce.logbook.read; logging, bypass requests and
// handovers need workforce.logbook.write. Workforce re-checks scope, four eyes and the two-person handover.
@Public()
@Controller('mobile/logbook')
export class MobileLogbookController {
  private readonly logger = new Logger(MobileLogbookController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('logbooks')
  @Header('Cache-Control', 'no-store')
  logbooks(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/logbooks', 'workforce.logbook.read');
  }

  @Get('logbooks/:id/board')
  @Header('Cache-Control', 'no-store')
  board(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/logbooks/${id}/board`, 'workforce.logbook.read');
  }

  @Post('logbooks/:id/entries')
  @Header('Cache-Control', 'no-store')
  entry(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!CreateLogEntryV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/logbooks/${id}/entries`, 'workforce.logbook.write', raw);
  }

  @Post('logbooks/:id/bypasses')
  @Header('Cache-Control', 'no-store')
  bypass(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!RequestBypassV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/logbooks/${id}/bypasses`, 'workforce.logbook.write', raw);
  }

  @Post('logbooks/:id/handovers')
  @Header('Cache-Control', 'no-store')
  submit(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!SubmitHandoverV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/logbooks/${id}/handovers`, 'workforce.logbook.write', raw);
  }

  @Post('handovers/:id/accept')
  @Header('Cache-Control', 'no-store')
  accept(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!AcceptHandoverV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/logbook-handovers/${id}/accept`, 'workforce.logbook.write', raw);
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile logbook request', () => forwardMobileModule(WORKFORCE_TARGET, {
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_LOGBOOK_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
