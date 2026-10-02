import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoCommsService } from './wfo-comms.service.js';

@Controller('wfo/comms')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoCommsController {
  constructor(private readonly commsService: WfoCommsService) {}

  @Post('send')
  @RequireRoles('TENANT_ADMIN', 'SCHEDULER')
  async sendMessage(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.commsService.sendMessage(req.principal!, body);
  }

  @Get('history')
  async listHistory(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('channel') channel?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commsService.listHistory(req.principal!, {
      channel,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('my-notifications')
  async getMyNotifications(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.commsService.getMyNotifications(req.principal!);
  }
}
