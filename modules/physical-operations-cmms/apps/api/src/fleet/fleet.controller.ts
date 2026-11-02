import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { FleetService } from './fleet.service.js';

/** WI-OI-139 M-DVIR: fleet check templates, enrolment and readiness, inspections and red tags. */
@Controller('v1/fleet')
@UseGuards(CmmsAuthorizationGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('templates')
  @RequirePermissions('cmms.fleet.read')
  listTemplates(@CurrentPrincipal() principal: CmmsPrincipal, @Query('status') status?: string) {
    return this.fleet.listTemplates(principal, status);
  }

  @Post('templates')
  @RequirePermissions('cmms.fleet.manage')
  createTemplate(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.fleet.createTemplate(context, body);
  }

  @Get('templates/:templateId')
  @RequirePermissions('cmms.fleet.read')
  getTemplate(@CurrentPrincipal() principal: CmmsPrincipal, @Param('templateId') templateId: string) {
    return this.fleet.getTemplate(principal, templateId);
  }

  @Patch('templates/:templateId')
  @RequirePermissions('cmms.fleet.manage')
  updateTemplate(@CommandContext() context: CmmsCommandContext, @Param('templateId') templateId: string, @Body() body: unknown) {
    return this.fleet.updateTemplate(context, templateId, body);
  }

  @Post('templates/:templateId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.manage')
  publishTemplate(@CommandContext() context: CmmsCommandContext, @Param('templateId') templateId: string, @Body() body: unknown) {
    return this.fleet.publishTemplate(context, templateId, body);
  }

  @Post('templates/:templateId/revise')
  @RequirePermissions('cmms.fleet.manage')
  reviseTemplate(@CommandContext() context: CmmsCommandContext, @Param('templateId') templateId: string, @Body() body: unknown) {
    return this.fleet.reviseTemplate(context, templateId, body);
  }

  @Post('templates/:templateId/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.manage')
  retireTemplate(@CommandContext() context: CmmsCommandContext, @Param('templateId') templateId: string, @Body() body: unknown) {
    return this.fleet.retireTemplate(context, templateId, body);
  }

  @Put('enrollments')
  @RequirePermissions('cmms.fleet.manage')
  enroll(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.fleet.enroll(context, body);
  }

  @Get('readiness')
  @RequirePermissions('cmms.fleet.read')
  readiness(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.fleet.readiness(principal);
  }

  @Get('assets/:assetId')
  @RequirePermissions('cmms.fleet.read')
  assetView(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.fleet.assetView(principal, assetId);
  }

  @Get('inspections')
  @RequirePermissions('cmms.fleet.read')
  listInspections(@CurrentPrincipal() principal: CmmsPrincipal, @Query() query: Record<string, string>) {
    return this.fleet.listInspections(principal, { assetId: query.assetId, from: query.from, to: query.to });
  }

  @Post('inspections')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.inspect')
  submitInspection(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.fleet.submitInspection(context, body);
  }

  @Get('inspections/:inspectionId')
  @RequirePermissions('cmms.fleet.read')
  getInspection(@CurrentPrincipal() principal: CmmsPrincipal, @Param('inspectionId') inspectionId: string) {
    return this.fleet.getInspection(principal, inspectionId);
  }

  @Get('inspections/:inspectionId/items/:itemKey/photo')
  @RequirePermissions('cmms.fleet.read')
  inspectionPhoto(@CurrentPrincipal() principal: CmmsPrincipal, @Param('inspectionId') inspectionId: string, @Param('itemKey') itemKey: string) {
    return this.fleet.inspectionPhoto(principal, inspectionId, itemKey);
  }

  @Get('groundings')
  @RequirePermissions('cmms.fleet.read')
  listGroundings(@CurrentPrincipal() principal: CmmsPrincipal, @Query('status') status?: string) {
    return this.fleet.listGroundings(principal, status);
  }

  @Post('groundings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.inspect')
  ground(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.fleet.groundManually(context, body);
  }

  @Post('groundings/:groundingId/certify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.certify')
  certify(@CommandContext() context: CmmsCommandContext, @Param('groundingId') groundingId: string, @Body() body: unknown) {
    return this.fleet.certifyRepair(context, groundingId, body);
  }

  @Post('groundings/:groundingId/clear')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.fleet.authorize')
  clear(@CommandContext() context: CmmsCommandContext, @Param('groundingId') groundingId: string, @Body() body: unknown) {
    return this.fleet.clearGrounding(context, groundingId, body);
  }
}
