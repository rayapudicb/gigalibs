import { CurrentUser } from '@gigalibs/auth-nest';
import {
  type AssignOperationalExceptionDto,
  AssignOperationalExceptionSchema,
  type EditAndReplayExceptionDto,
  EditAndReplayExceptionSchema,
  type ExceptionRecoveryCommandDto,
  ExceptionRecoveryCommandSchema,
  type ListOperationalExceptionsDto,
  ListOperationalExceptionsSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ExceptionService } from './exception.service.js';

@Controller('exceptions')
export class ExceptionController {
  constructor(private readonly exceptions: ExceptionService) {}

  @Get()
  @RequirePermissions('exceptions:read')
  list(
    @CurrentTenant('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(ListOperationalExceptionsSchema))
    query: ListOperationalExceptionsDto,
  ) {
    return this.exceptions.list(tenantId, query);
  }

  @Get(':exceptionId')
  @RequirePermissions('exceptions:read')
  get(@CurrentTenant('tenantId') tenantId: string, @Param('exceptionId') exceptionId: string) {
    return this.exceptions.get(tenantId, exceptionId);
  }

  @Post(':exceptionId/assign')
  @RequirePermissions('exceptions:assign')
  assign(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exceptionId') exceptionId: string,
    @Body(new ZodValidationPipe(AssignOperationalExceptionSchema))
    dto: AssignOperationalExceptionDto,
  ) {
    return this.exceptions.assign(tenantId, userId, exceptionId, dto);
  }

  @Post(':exceptionId/retry')
  @RequirePermissions('exceptions:recover')
  retry(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exceptionId') exceptionId: string,
    @Body(new ZodValidationPipe(ExceptionRecoveryCommandSchema)) dto: ExceptionRecoveryCommandDto,
  ) {
    return this.exceptions.retry(tenantId, userId, exceptionId, dto);
  }

  @Post(':exceptionId/replay')
  @RequirePermissions('exceptions:recover')
  replay(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exceptionId') exceptionId: string,
    @Body(new ZodValidationPipe(ExceptionRecoveryCommandSchema)) dto: ExceptionRecoveryCommandDto,
  ) {
    return this.exceptions.replay(tenantId, userId, exceptionId, dto);
  }

  @Post(':exceptionId/edit-and-replay')
  @RequirePermissions('exceptions:recover')
  editAndReplay(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exceptionId') exceptionId: string,
    @Body(new ZodValidationPipe(EditAndReplayExceptionSchema)) dto: EditAndReplayExceptionDto,
  ) {
    return this.exceptions.editAndReplay(tenantId, userId, exceptionId, dto);
  }

  @Post(':exceptionId/resolve')
  @RequirePermissions('exceptions:resolve')
  resolve(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('exceptionId') exceptionId: string,
    @Body(new ZodValidationPipe(ExceptionRecoveryCommandSchema)) dto: ExceptionRecoveryCommandDto,
  ) {
    return this.exceptions.resolve(tenantId, userId, exceptionId, dto);
  }
}
