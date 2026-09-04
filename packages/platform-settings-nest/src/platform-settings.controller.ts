import { CurrentUser } from '@gigalibs/auth-nest';
import {
  TenantPlatformSettingsPatchSchema,
  type TenantPlatformSettingsPatch,
} from '@gigalibs/platform-settings';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service.js';

@Controller('settings')
export class PlatformSettingsController {
  constructor(private readonly settingsService: PlatformSettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  getSettings(@CurrentTenant('tenantId') tenantId: string) {
    return this.settingsService.getForTenant(tenantId);
  }

  @Patch()
  @RequirePermissions('settings:update')
  updateSettings(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(TenantPlatformSettingsPatchSchema))
    patch: TenantPlatformSettingsPatch,
  ) {
    return this.settingsService.updateForTenant(tenantId, userId, patch);
  }
}
