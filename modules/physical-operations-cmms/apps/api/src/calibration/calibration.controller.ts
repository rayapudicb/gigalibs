import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { CalibrationService } from './calibration.service.js';

/** WI-OI-134 M-CAL: master standards, versioned instrument profiles, calibration records and certificates. */
@Controller('v1/calibration')
@UseGuards(CmmsAuthorizationGuard)
export class CalibrationController {
  constructor(private readonly calibration: CalibrationService) {}

  @Get('standards')
  @RequirePermissions('cmms.calibration.read')
  listStandards(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.calibration.listStandards(principal);
  }

  @Post('standards')
  @RequirePermissions('cmms.calibration.manage')
  createStandard(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.calibration.createStandard(context, body);
  }

  @Patch('standards/:standardId')
  @RequirePermissions('cmms.calibration.manage')
  updateStandard(@CommandContext() context: CmmsCommandContext, @Param('standardId') standardId: string, @Body() body: unknown) {
    return this.calibration.updateStandard(context, standardId, body);
  }

  @Get('profiles')
  @RequirePermissions('cmms.calibration.read')
  listProfiles(@CurrentPrincipal() principal: CmmsPrincipal, @Query('assetId') assetId?: string) {
    return this.calibration.listProfiles(principal, assetId);
  }

  @Post('profiles')
  @RequirePermissions('cmms.calibration.manage')
  createProfile(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.calibration.createProfile(context, body);
  }

  @Patch('profiles/:profileId')
  @RequirePermissions('cmms.calibration.manage')
  updateProfile(@CommandContext() context: CmmsCommandContext, @Param('profileId') profileId: string, @Body() body: unknown) {
    return this.calibration.updateProfile(context, profileId, body);
  }

  @Post('profiles/:profileId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.calibration.publish')
  publishProfile(@CommandContext() context: CmmsCommandContext, @Param('profileId') profileId: string, @Body() body: unknown) {
    return this.calibration.publishProfile(context, profileId, body);
  }

  @Get('instruments')
  @RequirePermissions('cmms.calibration.read')
  listInstruments(@CurrentPrincipal() principal: CmmsPrincipal, @Query('dueWithinDays') dueWithinDays?: string) {
    return this.calibration.listInstruments(principal, dueWithinDays);
  }

  @Get('instruments/:assetId/bundle')
  @RequirePermissions('cmms.calibration.read')
  bundle(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.calibration.bundle(principal, assetId);
  }

  @Get('instruments/:assetId/drift')
  @RequirePermissions('cmms.calibration.read')
  drift(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.calibration.drift(principal, assetId);
  }

  @Get('records')
  @RequirePermissions('cmms.calibration.read')
  searchRecords(@CurrentPrincipal() principal: CmmsPrincipal, @Query() query: Record<string, string>) {
    return this.calibration.searchRecords(principal, query);
  }

  @Post('records')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.calibration.execute')
  submit(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.calibration.submit(context, body);
  }

  @Get('records/:recordId')
  @RequirePermissions('cmms.calibration.read')
  getRecord(@CurrentPrincipal() principal: CmmsPrincipal, @Param('recordId') recordId: string) {
    return this.calibration.getRecord(principal, recordId);
  }

  @Post('records/:recordId/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.calibration.approve')
  decide(@CommandContext() context: CmmsCommandContext, @Param('recordId') recordId: string, @Body() body: unknown) {
    return this.calibration.decide(context, recordId, body);
  }

  @Get('records/:recordId/certificate')
  @RequirePermissions('cmms.calibration.read')
  certificate(@CurrentPrincipal() principal: CmmsPrincipal, @Param('recordId') recordId: string) {
    return this.calibration.certificate(principal, recordId);
  }
}
