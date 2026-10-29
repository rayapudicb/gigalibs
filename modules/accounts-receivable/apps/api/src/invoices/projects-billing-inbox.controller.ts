import {
  PROJECT_INVOICE_DRAFT_REQUESTED_V1,
  ProjectInvoiceDraftRequestedPayloadV1Schema,
  RelayEnvelopeV1Schema,
} from '@gigalibs/contracts';
import type { RelayRequest } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AR_PLATFORM_CONTEXT_ISSUER } from '../config.module-sdk.js';
import { InvoicesService } from './invoices.service.js';
import { ProjectsBillingInboxGuard } from './projects-billing-inbox.guard.js';

@Controller('internal/v1/projects-billing')
@UseGuards(ProjectsBillingInboxGuard)
export class ProjectsBillingInboxController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Req() request: RelayRequest, @Body() raw: unknown): Promise<object> {
    if (!request.relayClaims) throw new BadRequestException({ code: 'PROJECT_BILLING_RELAY_REQUIRED' });
    const parsed = RelayEnvelopeV1Schema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: 'PROJECT_BILLING_ENVELOPE_INVALID' });
    const envelope = parsed.data;
    const payload = ProjectInvoiceDraftRequestedPayloadV1Schema.safeParse(envelope.payload);
    if (
      envelope.eventType !== PROJECT_INVOICE_DRAFT_REQUESTED_V1 ||
      envelope.aggregateType !== 'project_billing_request' ||
      envelope.aggregateVersion !== 1 ||
      envelope.schemaVersion !== 1 ||
      !z.uuid().safeParse(envelope.tenantId).success ||
      !payload.success ||
      envelope.aggregateId !== payload.data.billingRequestId
    ) {
      throw new BadRequestException({ code: 'PROJECT_BILLING_EVENT_UNSUPPORTED' });
    }
    const result = await this.invoices.issueInvoiceFromProjectBilling(
      {
        tenantId: envelope.tenantId,
        subject: 'project-operations-relay',
        issuer: AR_PLATFORM_CONTEXT_ISSUER,
        permissions: [],
      },
      payload.data,
      envelope.correlationId,
      envelope.messageId,
    );
    return { status: result.duplicate ? 'DUPLICATE' : 'PROCESSED', ...result };
  }
}
