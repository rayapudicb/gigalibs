import {
  AuthorizeContractorEscortV1Schema,
  CheckoutContractorVisitV1Schema,
  CompleteContractorInductionV1Schema,
  EnrollContractorWorkerV1Schema,
  VerifyContractorPassV1Schema,
} from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, SAFETY_TARGET, answerMobile, forwardMobileModule } from './mobile-cmms-forward.js';

// WI-OI-143 M-CONTR: mobile contractor pass, gate verify, escort and roster via Safety Operations.
@Public()
@Controller('mobile/contractors')
export class MobileContractorController {
  private readonly logger = new Logger(MobileContractorController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Post('enroll')
  @Header('Cache-Control', 'no-store')
  enroll(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!EnrollContractorWorkerV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/contractor-workers/enroll', 'safety-operations.contractors.worker', raw);
  }

  @Get('worker/mine')
  @Header('Cache-Control', 'no-store')
  workerMine(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/contractor-workers/mine', 'safety-operations.contractors.worker');
  }

  @Post('induction')
  @Header('Cache-Control', 'no-store')
  induction(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!CompleteContractorInductionV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/contractor-inductions', 'safety-operations.contractors.worker', raw);
  }

  @Get('pass/mine')
  @Header('Cache-Control', 'no-store')
  myPass(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/contractor-passes/mine', 'safety-operations.contractors.worker');
  }

  @Post('pass/verify')
  @Header('Cache-Control', 'no-store')
  verify(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    if (!VerifyContractorPassV1Schema.safeParse(raw).success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/contractor-passes/verify', 'safety-operations.contractors.gate', raw);
  }

  @Get('roster')
  @Header('Cache-Control', 'no-store')
  roster(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/contractor-roster', 'safety-operations.contractors.roster');
  }

  @Post('visits/:visitId/checkout')
  @Header('Cache-Control', 'no-store')
  checkout(@Headers() headers: RequestHeaders, @Param('visitId') visitId: string, @Body() raw: unknown) {
    if (!MOBILE_UUID.test(visitId) || !CheckoutContractorVisitV1Schema.safeParse(raw).success) {
      throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    }
    return this.call(headers, 'POST', `/v1/contractor-visits/${visitId}/checkout`, 'safety-operations.contractors.roster', raw);
  }

  @Post('visits/:visitId/escort')
  @Header('Cache-Control', 'no-store')
  escort(@Headers() headers: RequestHeaders, @Param('visitId') visitId: string, @Body() raw: unknown) {
    if (!MOBILE_UUID.test(visitId) || !AuthorizeContractorEscortV1Schema.safeParse(raw).success) {
      throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    }
    return this.call(headers, 'POST', `/v1/contractor-visits/${visitId}/escort`, 'safety-operations.contractors.escort', raw);
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, permission: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile contractor request', () => forwardMobileModule(SAFETY_TARGET, {
      mobile: this.mobile, headers, method, path, permission, conflict: 'MOBILE_CONTRACTOR_CONFLICT', logger: this.logger,
      ...(body === undefined ? {} : { body }),
    }));
  }
}
