import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
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
import { InvoicesService } from './invoices.service.js';

interface PassthroughResponse {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

@Controller('v1/invoices')
@UseGuards(OidcAuthorizationGuard)
export class InvoicesController {
  constructor(@Inject(InvoicesService) private readonly invoices: InvoicesService) {}

  @Post()
  @RequirePermissions('ar.invoices.write')
  async createDraft(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const result = await this.invoices.createDraft(
      body,
      requirePrincipal(request),
      requireIdempotencyKey(idempotencyHeader),
      request.correlationId ?? 'unavailable',
    );
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    setEtag(response, result.body.version);
    return result.body;
  }

  @Get()
  @RequirePermissions('ar.invoices.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('pageSize') rawPageSize?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{ items: object[]; nextCursor: string | null }> {
    return this.invoices.list(
      requirePrincipal(request),
      rawPageSize === undefined ? 50 : Number(rawPageSize),
      status,
      customerId,
      cursor,
    );
  }

  @Get(':invoiceId')
  @RequirePermissions('ar.invoices.read')
  async get(
    @Param('invoiceId') invoiceId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const invoice = await this.invoices.get(invoiceId, requirePrincipal(request));
    setEtag(response, invoice.version);
    return invoice;
  }

  @Patch(':invoiceId')
  @RequirePermissions('ar.invoices.write')
  async updateDraft(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const invoice = await this.invoices.updateDraft(
      invoiceId,
      body,
      requireVersion(ifMatch),
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    setEtag(response, invoice.version);
    return invoice;
  }

  @Post(':invoiceId/issue')
  @RequirePermissions('ar.invoices.issue')
  async issue(
    @Param('invoiceId') invoiceId: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const result = await this.invoices.issue(
      invoiceId,
      body,
      requireVersion(ifMatch),
      requirePrincipal(request),
      requireIdempotencyKey(idempotencyHeader),
      request.correlationId ?? 'unavailable',
    );
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    setEtag(response, result.body.version);
    return result.body;
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}

function requireVersion(value: string | undefined): number {
  const match = /^\"([1-9]\d*)\"$/.exec(value ?? '');
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version)) {
    throw new BadRequestException(
      'If-Match must contain the quoted numeric ETag from the latest read.',
    );
  }
  return version;
}

function setEtag(response: PassthroughResponse, version: number): void {
  response.setHeader('ETag', `\"${version}\"`);
}
