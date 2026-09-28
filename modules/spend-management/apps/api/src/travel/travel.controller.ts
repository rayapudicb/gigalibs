import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { TravelService } from './travel.service.js';

@Controller('v1/travel')
@UseGuards(OidcAuthorizationGuard)
export class TravelController {
  constructor(private readonly travelService: TravelService) {}

  @Get('requests')
  @RequirePermissions('spend.travel.read')
  async list(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal!.tenantId;
    return this.travelService.listTravelRequests(tenantId);
  }

  @Post('estimate')
  @RequirePermissions('spend.travel.read')
  @HttpCode(HttpStatus.OK)
  estimate(@Body() body: { city: string; days: number }) {
    return this.travelService.calculateGsaRates(body.city || 'Standard CONUS', body.days || 1);
  }

  @Post('requests')
  @RequirePermissions('spend.travel.write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      costCenterId: string;
      employeeName: string;
      employeeEmail: string;
      destinationCity: string;
      destinationCountry?: string;
      departureDate: string;
      returnDate: string;
      businessPurpose: string;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.travelService.createTravelRequest(tenantId, body);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('spend.travel.write')
  async approve(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.principal!.tenantId;
    return this.travelService.approveTravelRequest(tenantId, id);
  }
}
