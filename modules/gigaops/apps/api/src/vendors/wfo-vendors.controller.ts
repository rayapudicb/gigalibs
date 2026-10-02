import {
  Body,
  Controller,
  Get,
  Param,
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
import { WfoVendorsService } from './wfo-vendors.service.js';

@Controller('wfo')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoVendorsController {
  constructor(private readonly vendorsService: WfoVendorsService) {}

  @Post('vendors')
  @RequireRoles('TENANT_ADMIN', 'SCHEDULER')
  async createVendor(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.vendorsService.createVendor(req.principal!, body);
  }

  @Get('vendors')
  async listVendors(@Req() req: AuthenticatedGigaOpsRequest) {
    return this.vendorsService.listVendors(req.principal!);
  }

  @Get('vendors/:id')
  async getVendor(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.vendorsService.getVendor(req.principal!, id);
  }

  @Post('support/tickets')
  async createTicket(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.vendorsService.createSupportTicket(req.principal!, body);
  }

  @Get('support/tickets')
  async listTickets(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('status') status?: string,
  ) {
    return this.vendorsService.listSupportTickets(req.principal!, status);
  }
}
