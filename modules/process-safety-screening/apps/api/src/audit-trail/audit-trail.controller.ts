import { ListSpeedAuditQueryV1Schema } from '@gigalibs/contracts';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../errors.js';
import { AuditTrailService } from './audit-trail.service.js';

interface FileResponse {
  setHeader(name: string, value: string): unknown;
}

/** SPEED's audit trail, `/api/speed/v1/audit-events` (WI-OI-120cc; screen spec §3.3). */
@Controller('v1/audit-events')
@UseGuards(AuthorizationGuard)
export class AuditTrailController {
  constructor(private readonly audit: AuditTrailService) {}

  /** Every SPEED member reaches it; the service reads all entries, only the member's own, or refuses. */
  @Get()
  @RequirePermissions('speed:read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.audit.list(principal, errors.parseInput(ListSpeedAuditQueryV1Schema, query));
  }

  @Get('export/csv')
  @RequirePermissions('speed.audit.read')
  async exportCsv(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: FileResponse,
  ) {
    const csv = await this.audit.csv(
      principal,
      errors.parseInput(ListSpeedAuditQueryV1Schema, query),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="speed-audit-trail.csv"');
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
