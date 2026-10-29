import { BadRequestException, Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { IngestService } from './ingest.service.js';

@Controller('v1/ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post(':deviceId')
  handle(
    @Param('deviceId') deviceId: string,
    @Body() payload: unknown,
    @Headers('x-iot-credential') credential: string | undefined,
    @Headers('x-iot-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<{ ip?: string }>,
  ) {
    if (!req.rawBody) throw new BadRequestException('Raw body required.');
    return this.ingest.ingest(deviceId, req.rawBody, credential, signature, payload);
  }
}
