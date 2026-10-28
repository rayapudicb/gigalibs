import { PartnerCreditCheckRequestV1Schema, PlatformContextPersonaSchema } from '@gigalibs/contracts';
import type { ModulePrincipal, RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CreditCheckCommandGuard } from './credit-check-command.guard.js';
import { CreditCheckService } from './credit-check.service.js';

const CreditCheckCommandEnvelope = z
  .object({
    tenantId: z.string().min(1),
    messageId: z.string().uuid(),
    actor: z
      .object({
        subject: z.string().min(1),
        sessionId: z.string().min(1),
        authVersion: z.number().int().positive(),
        permissions: z.array(z.string()),
        roles: z.array(z.string()),
        persona: PlatformContextPersonaSchema,
        organization: z.unknown(),
        departmentScope: z.unknown(),
        placeScope: z.unknown(),
      })
      .strict(),
    request: PartnerCreditCheckRequestV1Schema,
  })
  .strict();

@Controller('internal/v1/credit-check-command')
@UseGuards(CreditCheckCommandGuard)
export class CreditCheckCommandController {
  constructor(private readonly creditCheck: CreditCheckService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(@Req() relay: RelayRequest, @Body() body: unknown) {
    const envelope = CreditCheckCommandEnvelope.parse(body);
    const actor = envelope.actor;
    const principal: ModulePrincipal = {
      tenantId: envelope.tenantId,
      subject: actor.subject,
      sessionId: actor.sessionId,
      authVersion: actor.authVersion,
      permissions: actor.permissions,
      roles: actor.roles,
      persona: actor.persona,
      organization: actor.organization as ModulePrincipal['organization'],
      departmentScope: actor.departmentScope as ModulePrincipal['departmentScope'],
      placeScope: actor.placeScope as ModulePrincipal['placeScope'],
    };
    return this.creditCheck.check(
      { principal, correlationId: envelope.messageId },
      envelope.request,
    );
  }
}
