import { Public } from '@gigalibs/auth-nest';
import { type ExecutionAuditEventDto, ExecutionAuditEventSchema } from '@gigalibs/contracts';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ExecutionEventSignatureGuard } from './execution-event-signature.guard.js';
// biome-ignore lint/style/useImportType: NestJS emits this constructor token for runtime dependency injection.
import { ExecutionEventsService } from './execution-events.service.js';

@Controller('internal/execution-events')
export class ExecutionEventsController {
  constructor(private readonly executionEventsService: ExecutionEventsService) {}

  @Public()
  @Post()
  @UseGuards(ExecutionEventSignatureGuard)
  ingest(@Body(new ZodValidationPipe(ExecutionAuditEventSchema)) event: ExecutionAuditEventDto) {
    return this.executionEventsService.ingest(event);
  }
}
