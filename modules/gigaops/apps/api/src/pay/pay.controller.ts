import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CurrentWorkforcePrincipal, GigaOpsAuthorizationGuard, RequirePermissions, type GigaOpsPrincipal } from '../auth/authorization.js';
import { commandContext } from '../common/commands.js';
import { PayExportService } from './pay-export.service.js';
import { PayService } from './pay.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  send?(body: unknown): unknown;
}

/** Pay policy packs, rates and calculation runs (WI-OI-070). */
@Controller('v1')
@UseGuards(GigaOpsAuthorizationGuard)
export class PayController {
  constructor(
    private readonly pay: PayService,
    private readonly exports: PayExportService,
  ) {}

  @Get('pay-packs')
  @RequirePermissions('workforce.pay.read')
  packs() {
    return this.pay.packs();
  }

  @Get('pay-rates')
  @RequirePermissions('workforce.pay.read')
  rates(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.pay.listRates(principal, query);
  }

  @Post('pay-rates')
  @RequirePermissions('workforce.pay.manage')
  setRate(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.pay.setRate(commandContext(principal, correlationId), body);
  }

  @Get('pay-runs')
  @RequirePermissions('workforce.pay.read')
  runs(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query() query: unknown) {
    return this.pay.listRuns(principal, query);
  }

  /** 201 for a new run; 200 with `Idempotency-Replayed: true` when the request key was seen before. */
  @Post('pay-runs')
  @RequirePermissions('workforce.pay.manage')
  async calculate(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { replayed, ...run } = await this.pay.calculate(commandContext(principal, correlationId), body);
    if (replayed) {
      response.status(HttpStatus.OK);
      response.setHeader('Idempotency-Replayed', 'true');
    }
    return run;
  }

  @Get('pay-runs/:runId')
  @RequirePermissions('workforce.pay.read')
  run(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('runId') runId: string) {
    return this.pay.run(principal, runId);
  }

  @Get('pay-runs/:runId/verification')
  @RequirePermissions('workforce.pay.read')
  verify(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('runId') runId: string) {
    return this.pay.verify(principal, runId);
  }

  @Post('pay-runs/:runId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.pay.approve')
  approve(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ) {
    return this.pay.approve(commandContext(principal, correlationId), runId, body);
  }

  @Post('pay-runs/:runId/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.pay.manage')
  void(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ) {
    return this.pay.void(commandContext(principal, correlationId), runId, body);
  }

  // ─── Exports (WI-OI-071) ───────────────────────────────────────────────────────────────────────────────
  /** 201 for a new export; 200 with `Idempotency-Replayed: true` when the run already has one in that format. */
  @Post('pay-runs/:runId/exports')
  @RequirePermissions('workforce.pay.manage')
  async createExport(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('runId') runId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { replayed, ...created } = await this.exports.create(commandContext(principal, correlationId), runId, body);
    if (replayed) {
      response.status(HttpStatus.OK);
      response.setHeader('Idempotency-Replayed', 'true');
    }
    return created;
  }

  @Get('pay-exports')
  @RequirePermissions('workforce.pay.read')
  listExports(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Query('runId') runId: string | undefined) {
    return this.exports.list(principal, runId);
  }

  @Get('pay-exports/:exportId')
  @RequirePermissions('workforce.pay.read')
  getExport(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('exportId') exportId: string) {
    return this.exports.get(principal, exportId);
  }

  /** The export file exactly as stored; its SHA-256 is the ETag. */
  @Get('pay-exports/:exportId/file')
  @RequirePermissions('workforce.pay.read')
  async exportFile(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const file = await this.exports.file(principal, exportId);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    response.setHeader('ETag', `"${file.sha256}"`);
    return file.content;
  }

  @Get('pay-exports/:exportId/reconciliation')
  @RequirePermissions('workforce.pay.read')
  reconciliation(@CurrentWorkforcePrincipal() principal: GigaOpsPrincipal, @Param('exportId') exportId: string) {
    return this.exports.reconciliation(principal, exportId);
  }

  @Post('pay-exports/:exportId/acknowledge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('workforce.pay.manage')
  acknowledge(
    @CurrentWorkforcePrincipal() principal: GigaOpsPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('exportId') exportId: string,
    @Body() body: unknown,
  ) {
    return this.exports.acknowledge(commandContext(principal, correlationId), exportId, body);
  }
}
