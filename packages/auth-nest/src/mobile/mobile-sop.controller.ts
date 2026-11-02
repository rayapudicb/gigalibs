import { RecordSopStepV1Schema, SopFeedbackInputV1Schema, StartSopExecutionV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

const STEP_KEY = /^[a-z][a-z0-9-]{0,31}$/;

// WI-OI-138 M-SOP: the mobile work-instruction adapter. Reading published procedures needs cmms.sop.read; performing,
// countersigning and flagging a step need cmms.sop.execute. CMMS enforces the path, the gates and the second person.
@Public()
@Controller('mobile/sop')
export class MobileSopController {
  private readonly logger = new Logger(MobileSopController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('procedures')
  @Header('Cache-Control', 'no-store')
  procedures(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/sop/procedures?status=PUBLISHED', 'cmms.sop.read');
  }

  @Get('procedures/:id')
  @Header('Cache-Control', 'no-store')
  procedure(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/sop/procedures/${id}`, 'cmms.sop.read');
  }

  @Get('procedures/:id/steps/:key/image')
  @Header('Cache-Control', 'no-store')
  stepImage(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('key') key: string) {
    this.uuid(id);
    this.key(key);
    return this.call(headers, 'GET', `/v1/sop/procedures/${id}/steps/${key}/image`, 'cmms.sop.read');
  }

  @Post('procedures/:id/feedback')
  @Header('Cache-Control', 'no-store')
  feedback(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!SopFeedbackInputV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/sop/procedures/${id}/feedback`, 'cmms.sop.execute', raw);
  }

  @Get('executions/awaiting-cosign')
  @Header('Cache-Control', 'no-store')
  awaiting(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/sop/executions?awaitingCosign=true', 'cmms.sop.execute');
  }

  @Post('executions')
  @Header('Cache-Control', 'no-store')
  start(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!StartSopExecutionV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/sop/executions', 'cmms.sop.execute', raw);
  }

  @Get('executions/:id')
  @Header('Cache-Control', 'no-store')
  execution(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/sop/executions/${id}`, 'cmms.sop.read');
  }

  @Post('executions/:id/steps')
  @Header('Cache-Control', 'no-store')
  step(@Headers() headers: RequestHeaders, @Param('id') id: string, @Body() raw: unknown) {
    this.uuid(id);
    if (!RecordSopStepV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', `/v1/sop/executions/${id}/steps`, 'cmms.sop.execute', raw);
  }

  @Post('executions/:id/steps/:key/cosign')
  @Header('Cache-Control', 'no-store')
  cosign(@Headers() headers: RequestHeaders, @Param('id') id: string, @Param('key') key: string) {
    this.uuid(id);
    this.key(key);
    return this.call(headers, 'POST', `/v1/sop/executions/${id}/steps/${key}/cosign`, 'cmms.sop.execute', {});
  }

  @Post('executions/:id/complete')
  @Header('Cache-Control', 'no-store')
  complete(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'POST', `/v1/sop/executions/${id}/complete`, 'cmms.sop.execute', {});
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private key(key: string) {
    if (!STEP_KEY.test(key)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile work instruction request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_SOP_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
