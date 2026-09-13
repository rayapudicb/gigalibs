import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type ArPrincipal,
  type AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { CreditNotesService } from './credit-notes.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  // ── Issue credit note ─────────────────────────────────────────────────────

  @Post('invoices/:invoiceId/credit-notes')
  @RequirePermissions('ar.invoices.credit-note')
  async issue(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const principal = requirePrincipal(req);
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();
    const result = await this.creditNotes.issue(invoiceId, body, principal, correlationId);
    return { ...result, _httpStatus: 201 };
  }

  // ── List credit notes ─────────────────────────────────────────────────────

  @Get('invoices/:invoiceId/credit-notes')
  @RequirePermissions('ar.invoices.read')
  async list(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.creditNotes.list(invoiceId, requirePrincipal(req));
  }

  // ── Collections ───────────────────────────────────────────────────────────

  @Post('invoices/:invoiceId/collections')
  @RequirePermissions('ar.invoices.collect')
  async logEvent(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.creditNotes.logCollectionEvent(invoiceId, body, requirePrincipal(req));
    return { ...result, _httpStatus: 201 };
  }

  @Get('invoices/:invoiceId/collections')
  @RequirePermissions('ar.invoices.read')
  async listEvents(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.creditNotes.listCollectionEvents(invoiceId, requirePrincipal(req));
  }

  // ── Aging report ──────────────────────────────────────────────────────────

  @Get('invoices/aging')
  @RequirePermissions('ar.invoices.read')
  async aging(
    @Req() req: AuthenticatedRequest,
    @Query('bucket') bucket?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.creditNotes.aging(requirePrincipal(req), bucket, customerId);
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
