import {
  Body,
  type CanActivate,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  type Type,
  UseGuards,
} from '@nestjs/common';
import type { RecordDispatcher, RecordValues } from './record-dispatcher.js';
import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions } from './signed-context.js';

/** The injection token a module binds to its RecordDispatcher. */
export const RECORD_DISPATCHER = Symbol('RECORD_DISPATCHER');

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

const etag = (record: RecordValues) => (typeof record.version === 'number' ? `"${record.version}"` : undefined);

/**
 * WI-OI-120f (F0.3): the record routes a module mounts for its metadata windows. The module's signed-context guard
 * checks the entitlement and `readPermission` on every route; the dispatcher then checks each entity's own permission.
 *
 * - GET    v1/records/:entity                     list (page, pageSize, search, sort, direction, filter.<field>, parentId)
 * - POST   v1/records/:entity                     create (Idempotency-Key)
 * - GET    v1/records/:entity/:id                 read (ETag is the record version)
 * - PATCH  v1/records/:entity/:id                 update (If-Match)
 * - POST   v1/records/:entity/:id/actions/:action  run a registered action (Idempotency-Key)
 * - GET    v1/lookups/:resolver                   lookup options (search, ids)
 */
export function createRecordController(options: {
  readonly guard: Type<CanActivate>;
  readonly readPermission: string;
}): Type<unknown> {
  @Controller('v1')
  @UseGuards(options.guard)
  @RequirePermissions(options.readPermission)
  class ModuleRecordController {
    constructor(@Inject(RECORD_DISPATCHER) private readonly records: RecordDispatcher) {}

    @Get('records/:entity')
    list(@CurrentPrincipal() principal: ModulePrincipal, @Param('entity') entity: string, @Query() query: Record<string, unknown>) {
      return this.records.list(principal, entity, query);
    }

    @Post('records/:entity')
    async create(
      @CommandContext() context: ModuleCommandContext,
      @Param('entity') entity: string,
      @Body() body: unknown,
      @Headers('idempotency-key') idempotencyKey: string | undefined,
      @Res({ passthrough: true }) response: HeaderResponse,
    ) {
      const record = await this.records.create(context, entity, body, idempotencyKey);
      const tag = etag(record);
      if (tag) response.setHeader('ETag', tag);
      return record;
    }

    @Get('records/:entity/:id')
    async get(
      @CurrentPrincipal() principal: ModulePrincipal,
      @Param('entity') entity: string,
      @Param('id') id: string,
      @Res({ passthrough: true }) response: HeaderResponse,
    ) {
      const record = await this.records.get(principal, entity, id);
      const tag = etag(record);
      if (tag) response.setHeader('ETag', tag);
      return record;
    }

    @Patch('records/:entity/:id')
    async update(
      @CommandContext() context: ModuleCommandContext,
      @Param('entity') entity: string,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('if-match') ifMatch: string | undefined,
      @Res({ passthrough: true }) response: HeaderResponse,
    ) {
      const record = await this.records.update(context, entity, id, body, ifMatch);
      const tag = etag(record);
      if (tag) response.setHeader('ETag', tag);
      return record;
    }

    @Post('records/:entity/:id/actions/:action')
    @HttpCode(200)
    action(
      @CommandContext() context: ModuleCommandContext,
      @Param('entity') entity: string,
      @Param('id') id: string,
      @Param('action') action: string,
      @Body() body: unknown,
      @Headers('idempotency-key') idempotencyKey: string | undefined,
    ) {
      return this.records.action(context, entity, id, action, body, idempotencyKey);
    }

    @Get('lookups/:resolver')
    lookup(@CurrentPrincipal() principal: ModulePrincipal, @Param('resolver') resolver: string, @Query() query: Record<string, unknown>) {
      return this.records.lookup(principal, resolver, query);
    }
  }
  return ModuleRecordController;
}
