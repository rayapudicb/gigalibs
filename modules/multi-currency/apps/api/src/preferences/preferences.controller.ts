import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { PreferencesService, type TenantPreferences } from './preferences.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get('preferences')
  @RequirePermissions('currency:read')
  async getPreferences(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: TenantPreferences }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.getPreferences(tenantId);
    return { data };
  }

  @Put('preferences')
  @RequirePermissions('currency:admin')
  async updatePreferences(
    @Body() body: Partial<TenantPreferences>,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: TenantPreferences }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.updatePreferences(tenantId, body);
    return { data };
  }
}
