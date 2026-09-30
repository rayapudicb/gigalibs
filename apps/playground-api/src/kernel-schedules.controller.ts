import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type CreateKernelScheduleDto,
  CreateKernelScheduleSchema,
  KernelScheduleFilterSchema,
  type ScheduledOperation,
} from '@gigalibs/contracts';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { KernelSchedulesService } from './kernel-schedules.service.js';

/**
 * WI-OI-104c. Each route checks the scheduled operation's own permission in the service (a report run needs
 * analytics:reports:write, a connector sync connections:sync), since one schedule list spans modules. Explicit actions
 * rather than DELETE keep the web control-plane proxy to read, create and update.
 */
@Controller('tenants/current/schedules')
export class KernelSchedulesController {
  constructor(@Inject(KernelSchedulesService) private readonly schedules: KernelSchedulesService) {}

  @Get()
  list(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query(new ZodValidationPipe(KernelScheduleFilterSchema)) filter: { operation?: ScheduledOperation; targetId?: string },
  ) {
    return this.schedules.list(tenantId, userId, filter);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateKernelScheduleSchema)) dto: CreateKernelScheduleDto,
  ) {
    return this.schedules.create(tenantId, userId, dto);
  }

  @Get(':scheduleId/runs')
  runs(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.schedules.runs(tenantId, userId, scheduleId);
  }

  @Post(':scheduleId/pause')
  @HttpCode(200)
  pause(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.schedules.pause(tenantId, userId, scheduleId);
  }

  @Post(':scheduleId/resume')
  @HttpCode(200)
  resume(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.schedules.resume(tenantId, userId, scheduleId);
  }

  @Post(':scheduleId/remove')
  @HttpCode(200)
  remove(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.schedules.remove(tenantId, userId, scheduleId);
  }
}
