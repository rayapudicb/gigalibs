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
import { WfoShiftsService } from './wfo-shifts.service.js';

@Controller('wfo')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoShiftsController {
  constructor(private readonly shiftsService: WfoShiftsService) {}

  @Get('shifts/open')
  async listOpenShifts(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('skillId') skillId?: string,
  ) {
    return this.shiftsService.listOpenShifts(req.principal!, { orgUnitId, skillId });
  }

  @Post('shifts/:id/pickup')
  async pickupShift(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { workerId?: string; notes?: string },
  ) {
    return this.shiftsService.claimShift(req.principal!, {
      bookingId: id,
      workerId: body.workerId || req.principal!.subject,
      notes: body.notes,
    });
  }

  @Post('shift-swaps')
  async createShiftSwap(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.shiftsService.createShiftSwap(req.principal!, body);
  }

  @Get('shift-swaps')
  async listShiftSwaps(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('status') status?: string,
  ) {
    return this.shiftsService.listShiftSwaps(req.principal!, status);
  }

  @Post('shift-swaps/:id/approve')
  @RequireRoles('TENANT_ADMIN', 'SCHEDULER')
  async approveShiftSwap(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { decision?: 'APPROVE' | 'REJECT'; reason?: string },
  ) {
    return this.shiftsService.respondShiftSwap(req.principal!, id, {
      decision: body.decision || 'APPROVE',
      reason: body.reason,
    });
  }
}
