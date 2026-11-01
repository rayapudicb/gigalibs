import { SubmitCalibrationRecordV1Schema } from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException } from './mobile-auth.service.js';
import { MOBILE_UUID, type RequestHeaders, answerMobile, forwardMobileCmms } from './mobile-cmms-forward.js';

// WI-OI-134 M-CAL: the mobile Calibration adapter (cmms.calibration.execute). CMMS re-checks permission, scope and every reading.
@Public()
@Controller('mobile/calibration')
export class MobileCalibrationController {
  private readonly logger = new Logger(MobileCalibrationController.name);
  constructor(private readonly mobile: MobileAuthService) {}

  @Get('instruments')
  @Header('Cache-Control', 'no-store')
  instruments(@Headers() headers: RequestHeaders) {
    return this.call(headers, 'GET', '/v1/calibration/instruments');
  }

  @Get('instruments/:id/bundle')
  @Header('Cache-Control', 'no-store')
  bundle(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/calibration/instruments/${id}/bundle`);
  }

  @Post('records')
  @Header('Cache-Control', 'no-store')
  submit(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const body = SubmitCalibrationRecordV1Schema.safeParse(raw);
    if (!body.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.call(headers, 'POST', '/v1/calibration/records', body.data);
  }

  @Get('records/:id')
  @Header('Cache-Control', 'no-store')
  record(@Headers() headers: RequestHeaders, @Param('id') id: string) {
    this.uuid(id);
    return this.call(headers, 'GET', `/v1/calibration/records/${id}`);
  }

  private uuid(id: string) {
    if (!MOBILE_UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private call(headers: RequestHeaders, method: 'GET' | 'POST', path: string, body?: unknown) {
    return answerMobile(this.logger, 'Mobile calibration request', () => forwardMobileCmms({
      mobile: this.mobile, headers, method, path, permission: 'cmms.calibration.execute',
      conflict: 'MOBILE_CALIBRATION_CONFLICT', logger: this.logger, ...(body === undefined ? {} : { body }),
    }));
  }
}
