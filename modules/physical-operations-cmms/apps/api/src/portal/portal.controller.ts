import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { PortalService } from './portal.service.js';

/**
 * WI-OI-140 M-REQ. The link and submission routes are for signed-in managers (and the web gateway lists them). The
 * portal routes take a context only the control plane mints, for `portal:<link>` with cmms.portal.submit; no web or
 * mobile gateway lists them.
 */
@Controller('v1/portal')
@UseGuards(CmmsAuthorizationGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('links')
  @RequirePermissions('cmms.portal.manage')
  listLinks(@CurrentPrincipal() principal: CmmsPrincipal, @Query('assetId') assetId?: string) {
    return this.portal.listLinks(principal, assetId);
  }

  @Post('links')
  @RequirePermissions('cmms.portal.manage')
  createLink(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.portal.createLink(context, body);
  }

  @Post('links/:linkId/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.portal.manage')
  revokeLink(@CommandContext() context: CmmsCommandContext, @Param('linkId') linkId: string, @Body() body: unknown) {
    return this.portal.revokeLink(context, linkId, body);
  }

  @Get('submissions')
  @RequirePermissions('cmms.portal.manage')
  listSubmissions(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.portal.listSubmissions(principal);
  }

  @Get('submissions/:submissionId/photo')
  @RequirePermissions('cmms.portal.manage')
  submissionPhoto(@CurrentPrincipal() principal: CmmsPrincipal, @Param('submissionId') submissionId: string) {
    return this.portal.submissionPhoto(principal, submissionId);
  }

  @Post('context')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.portal.submit')
  context(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.portal.context(principal, body);
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.portal.submit')
  submit(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.portal.submit(context, body);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.portal.submit')
  status(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.portal.status(principal, body);
  }
}
