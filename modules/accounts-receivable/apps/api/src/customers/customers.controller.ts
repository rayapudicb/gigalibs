import {
  Body,
  Controller,
  Delete,
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
  ArAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { requireIdempotencyKey } from '../database/persistence-helpers.js';
import { CustomersService } from './customers.service.js';

interface PassthroughResponse {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

@Controller('v1/customers')
@UseGuards(ArAuthorizationGuard)
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  // ── POST /v1/customers ────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('ar.customers.write')
  async create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const result = await this.customers.create(
      body,
      requirePrincipal(request),
      requireIdempotencyKey(idempotencyHeader),
      request.correlationId ?? 'unavailable',
    );
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    response.setHeader('ETag', `"${result.body.version}"`);
    return result.body;
  }

  // ── GET /v1/customers ─────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('ar.customers.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('pageSize') rawPageSize?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<{ items: object[]; nextCursor: string | null }> {
    const pageSize = rawPageSize === undefined ? 50 : Number(rawPageSize);
    return this.customers.list(requirePrincipal(request), pageSize, cursor, status, search);
  }

  // ── GET /v1/customers/:id ─────────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('ar.customers.read')
  get(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    return this.customers.get(id, requirePrincipal(request)).then((customer) => {
      response.setHeader('ETag', `"${customer.version}"`);
      return customer;
    });
  }

  // ── PATCH /v1/customers/:id ───────────────────────────────────────────────

  @Patch(':id')
  @RequirePermissions('ar.customers.write')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const updated = await this.customers.update(
      id,
      body,
      ifMatch,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.setHeader('ETag', `"${updated.version}"`);
    return updated;
  }

  // ── POST /v1/customers/:id/deactivate ─────────────────────────────────────

  @Post(':id/deactivate')
  @RequirePermissions('ar.customers.write')
  deactivate(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<object> {
    return this.customers.deactivate(
      id,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
  }

  // ── POST /v1/customers/:id/reactivate ─────────────────────────────────────

  @Post(':id/reactivate')
  @RequirePermissions('ar.customers.write')
  reactivate(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<object> {
    return this.customers.reactivate(
      id,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
  }

  // ── GET /v1/customers/:id/contacts ────────────────────────────────────────

  @Get(':id/contacts')
  @RequirePermissions('ar.customers.read')
  listContacts(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ items: object[] }> {
    return this.customers.listContacts(id, requirePrincipal(request));
  }

  // ── POST /v1/customers/:id/contacts ───────────────────────────────────────

  @Post(':id/contacts')
  @RequirePermissions('ar.customers.write')
  async addContact(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const contact = await this.customers.addContact(
      id,
      body,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(201);
    return contact;
  }

  // ── DELETE /v1/customers/:id/contacts/:contactId ──────────────────────────

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('ar.customers.write')
  async removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<void> {
    await this.customers.removeContact(
      id,
      contactId,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(204);
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
