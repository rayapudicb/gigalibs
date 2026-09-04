import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type CreateValueDefinitionDto,
  CreateValueDefinitionSchema,
  type DecideValueEventDto,
  DecideValueEventSchema,
  type ListValueDefinitionsDto,
  ListValueDefinitionsSchema,
  type ListValueEventsDto,
  ListValueEventsSchema,
  type PublishValueDefinitionDto,
  PublishValueDefinitionSchema,
  type ValueReportQueryDto,
  ValueReportQuerySchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ValueLedgerService } from './value-ledger.service.js';

@Controller('value')
export class ValueLedgerController {
  constructor(private readonly valueLedger: ValueLedgerService) {}

  @Get('definitions')
  @RequirePermissions('value:read')
  listDefinitions(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ListValueDefinitionsSchema)) query: ListValueDefinitionsDto,
  ) {
    return this.valueLedger.listDefinitions(tenantId, query);
  }

  @Post('definitions')
  @RequirePermissions('value:configure')
  createDefinition(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateValueDefinitionSchema)) dto: CreateValueDefinitionDto,
  ) {
    return this.valueLedger.createDefinition(tenantId, userId, dto);
  }

  @Get('definitions/:definitionId')
  @RequirePermissions('value:read')
  getDefinition(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('definitionId') definitionId: string,
  ) {
    return this.valueLedger.getDefinition(tenantId, definitionId);
  }

  @Post('definitions/:definitionId/publish')
  @RequirePermissions('value:configure')
  publishDefinition(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('definitionId') definitionId: string,
    @Body(new ZodValidationPipe(PublishValueDefinitionSchema)) dto: PublishValueDefinitionDto,
  ) {
    return this.valueLedger.publishDefinition(tenantId, userId, definitionId, dto);
  }

  @Get('events')
  @RequirePermissions('value:read')
  listEvents(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ListValueEventsSchema)) query: ListValueEventsDto,
  ) {
    return this.valueLedger.listEvents(tenantId, query);
  }

  @Get('events/:eventId')
  @RequirePermissions('value:read')
  getEvent(@CurrentTenant('tenantId') tenantId: string, @Param('eventId') eventId: string) {
    return this.valueLedger.getEvent(tenantId, eventId);
  }

  @Post('events/:eventId/verify')
  @RequirePermissions('value:verify')
  verifyEvent(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(DecideValueEventSchema)) dto: DecideValueEventDto,
  ) {
    return this.valueLedger.verify(tenantId, userId, eventId, dto);
  }

  @Post('events/:eventId/reject')
  @RequirePermissions('value:verify')
  rejectEvent(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(DecideValueEventSchema)) dto: DecideValueEventDto,
  ) {
    return this.valueLedger.reject(tenantId, userId, eventId, dto);
  }

  @Get('report')
  @RequirePermissions('value:read')
  report(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ValueReportQuerySchema)) query: ValueReportQueryDto,
  ) {
    return this.valueLedger.report(tenantId, query);
  }
}
