import {
  RequestSpeedDossierInputV1Schema,
  SPEED_DOSSIER_FORMATS,
  type SpeedDossierFormat,
} from '@gigalibs/contracts';
import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../errors.js';
import { DossiersService } from './dossiers.service.js';

interface FileResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

function format(value: string): SpeedDossierFormat {
  if ((SPEED_DOSSIER_FORMATS as readonly string[]).includes(value))
    return value as SpeedDossierFormat;
  return errors.notFound('The file');
}

function attach(response: FileResponse, contentType: string, fileName: string): void {
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  response.setHeader('Cache-Control', 'no-store');
}

/** A route's dossiers and exports, `/api/speed/v1/routes/{id}/…` (WI-OI-120ca; plan v1.4 §4.4). */
@Controller('v1/routes')
@UseGuards(AuthorizationGuard)
export class RouteDossiersController {
  constructor(private readonly dossiers: DossiersService) {}

  /** Queues a dossier (202); a replay of the same request key answers 200 with the same dossier. */
  @Post(':id/dossiers')
  @RequirePermissions('speed.routes.read')
  async request(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: FileResponse,
  ) {
    const { dossier, replayed } = await this.dossiers.request(
      context,
      id,
      errors.parseInput(RequestSpeedDossierInputV1Schema, body),
    );
    response.status(replayed ? 200 : 202);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return dossier;
  }

  @Get(':id/dossiers')
  @RequirePermissions('speed.routes.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.dossiers.list(principal, id);
  }

  @Get(':id/export/json')
  @RequirePermissions('speed.routes.read')
  exportJson(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.dossiers.exportJson(principal, id);
  }

  @Get(':id/export/csv')
  @RequirePermissions('speed.routes.read')
  async exportCsv(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: FileResponse,
  ) {
    const { csv, fileName } = await this.dossiers.exportCsv(principal, id);
    attach(response, 'text/csv; charset=utf-8', fileName);
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}

/** Dossiers, `/api/speed/v1/dossiers` (WI-OI-120ca). */
@Controller('v1/dossiers')
@UseGuards(AuthorizationGuard)
export class DossiersController {
  constructor(private readonly dossiers: DossiersService) {}

  @Get(':id')
  @RequirePermissions('speed.routes.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.dossiers.get(principal, id);
  }

  /** The file, streamed after its SHA-256 is checked against the one recorded at generation (409 on a mismatch). */
  @Get(':id/files/:format')
  @RequirePermissions('speed.routes.read')
  async download(
    @CommandContext() context: ModuleCommandContext,
    @Param('id') id: string,
    @Param('format') requested: string,
    @Res({ passthrough: true }) response: FileResponse,
  ) {
    const file = await this.dossiers.download(context, id, format(requested));
    attach(response, file.contentType, file.fileName);
    response.setHeader('Content-Length', String(file.bytes.byteLength));
    return new StreamableFile(file.bytes);
  }
}
