import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type ArPrincipal,
  type AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { requireIdempotencyKey } from '../database/persistence-helpers.js';
import { SeriesService } from './series.service.js';

interface PassthroughResponse {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

@Controller('v1/series')
@UseGuards(OidcAuthorizationGuard)
export class SeriesController {
  constructor(@Inject(SeriesService) private readonly series: SeriesService) {}

  // ── GET /v1/series ────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('ar.settings.read')
  list(@Req() request: AuthenticatedRequest): Promise<{ items: object[] }> {
    return this.series.list(requirePrincipal(request));
  }

  // ── POST /v1/series ───────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('ar.settings.manage')
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const result = await this.series.create(
      body,
      requirePrincipal(request),
      requireIdempotencyKey(idempotencyHeader),
      request.correlationId ?? 'unavailable',
    );
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    response.setHeader('ETag', `"${result.body.version}"`);
    return result.body;
  }

  // ── PATCH /v1/series/:id ──────────────────────────────────────────────────

  @Patch(':id')
  @RequirePermissions('ar.settings.manage')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const updated = await this.series.update(
      id,
      body,
      ifMatch,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.setHeader('ETag', `"${updated.version}"`);
    return updated;
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
