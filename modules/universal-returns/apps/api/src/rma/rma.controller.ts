import {
  CreateRmaInputV1Schema,
  RecordRmaDispositionInputV1Schema,
  RequestRmaCreditMemoInputV1Schema,
  RmaDocumentActionInputV1Schema,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { AuthorizationGuard } from '../authorization.js';
import { RmaService } from './rma.service.js';

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Validation failed');
  }
  return parsed.data;
}

function commandContext(principal: ModulePrincipal, body: { requestKey?: string }): ModuleCommandContext {
  return {
    principal,
    correlationId: body.requestKey ?? principal.sessionId,
  };
}

@Controller('v1/rmas')
@UseGuards(AuthorizationGuard)
export class RmaController {
  constructor(private readonly rmaService: RmaService) {}

  @Get()
  @RequirePermissions('universal-returns.rma.read')
  list(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.rmaService.list({ principal, correlationId: principal.sessionId });
  }

  @Get(':id')
  @RequirePermissions('universal-returns.rma.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.rmaService.get({ principal, correlationId: principal.sessionId }, id);
  }

  @Post()
  @RequirePermissions('universal-returns.rma.manage')
  create(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(CreateRmaInputV1Schema, body);
    return this.rmaService.create(commandContext(principal, input), input);
  }

  @Post(':id/submit')
  @RequirePermissions('universal-returns.rma.manage')
  submit(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(RmaDocumentActionInputV1Schema, body);
    return this.rmaService.submit(commandContext(principal, input), id, input);
  }

  @Post(':id/authorize')
  @RequirePermissions('universal-returns.rma.authorize')
  authorize(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(RmaDocumentActionInputV1Schema, body);
    return this.rmaService.authorize(commandContext(principal, input), id, input);
  }

  @Post(':id/dispositions')
  @RequirePermissions('universal-returns.disposition.manage')
  recordDisposition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(RecordRmaDispositionInputV1Schema, body);
    return this.rmaService.recordDisposition(commandContext(principal, input), id, input);
  }

  @Post(':id/credit-memo-request')
  @RequirePermissions('universal-returns.rma.manage')
  requestCreditMemo(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(RequestRmaCreditMemoInputV1Schema, body);
    return this.rmaService.requestCreditMemo(commandContext(principal, input), id, input);
  }
}
