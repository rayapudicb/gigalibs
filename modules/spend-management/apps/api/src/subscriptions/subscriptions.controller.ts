import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Controller('v1/subscriptions')
@UseGuards(OidcAuthorizationGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @RequirePermissions('spend.subscriptions.read')
  async list(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal!.tenantId;
    return this.subscriptionsService.listSubscriptions(tenantId);
  }

  @Post()
  @RequirePermissions('spend.subscriptions.write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      vendorName: string;
      category: string;
      costCenterId: string;
      ownerEmail: string;
      billingFrequency?: string;
      seatsAllocated?: number;
      seatsUtilized?: number;
      costPerSeatMinor?: number;
      annualRunRateMinor: number;
      renewalDate: string;
      autoRenew?: boolean;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.subscriptionsService.createSubscription(tenantId, body);
  }

  @Patch(':id/status')
  @RequirePermissions('spend.subscriptions.write')
  async updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.subscriptionsService.updateSubscriptionStatus(tenantId, id, body.status);
  }
}
