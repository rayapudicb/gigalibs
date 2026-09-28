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
import {
  AgreementsService,
  type CreateAgreementDto,
} from './agreements.service.js';

@Controller('agreements')
@UseGuards(GigaOpsAuthorizationGuard)
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('workerId') workerId?: string,
    @Query('roleId') roleId?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.agreementsService.list(tenantId, {
      workerId,
      roleId,
      status,
    });
  }

  @Post()
  @RequireRoles('workforce_manager', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreateAgreementDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.agreementsService.create(tenantId, dto);
  }

  @Post(':id/sign')
  sign(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const ip = req.ip?.trim() || req.socket.remoteAddress?.trim() || null;
    const userAgentHeader = req.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string'
        ? userAgentHeader
        : Array.isArray(userAgentHeader)
          ? userAgentHeader[0] ?? null
          : null;
    return this.agreementsService.sign(tenantId, id, ip, userAgent);
  }

  @Post(':id/reject')
  reject(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.agreementsService.reject(tenantId, id, body?.reason);
  }

  @Post(':id/resend')
  @RequireRoles('workforce_manager', 'org_admin')
  resend(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.agreementsService.resend(tenantId, id);
  }
}
