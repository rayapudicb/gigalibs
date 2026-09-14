import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type CreateTenantDataExportDto,
  CreateTenantDataExportSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { TenantDataExportService } from './tenant-data-export.service.js';

@Controller('tenants/current/data-exports')
@RequirePermissions('tenant:export')
export class TenantDataExportController {
  constructor(private readonly service: TenantDataExportService) {}

  @Get()
  list(@CurrentTenant('tenantId') tenantId: string) {
    return this.service.list(tenantId);
  }

  @Post()
  @HttpCode(202)
  request(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateTenantDataExportSchema)) dto: CreateTenantDataExportDto,
  ) {
    return this.service.request(tenantId, userId, dto.reason);
  }

  @Get(':exportId/download')
  @Header('Cache-Control', 'no-store')
  download(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exportId') exportId: string,
  ) {
    return this.service.createDownload(tenantId, userId, exportId);
  }
}
