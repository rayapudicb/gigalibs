import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TicketsService, type CreateTicketDto } from './tickets.service.js';
import type { TicketPriority, TicketStatus } from '@gigalibs/tickets-core';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  private extractTenantId(headers: Record<string, string>): string {
    const tenantId = headers['x-tenant-id'] || 'default_tenant';
    return tenantId;
  }

  @Post()
  async create(
    @Headers() headers: Record<string, string>,
    @Body() dto: CreateTicketDto,
  ) {
    const tenantId = this.extractTenantId(headers);
    if (!dto.title || !dto.description || !dto.requesterEmail) {
      throw new BadRequestException('title, description, and requesterEmail are required.');
    }
    return this.service.create(tenantId, dto);
  }

  @Get()
  async list(
    @Headers() headers: Record<string, string>,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('assignedAgentId') assignedAgentId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    return this.service.list(tenantId, {
      status,
      priority,
      assignedAgentId,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id')
  async findById(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    const ticket = await this.service.findById(tenantId, id);
    if (!ticket) throw new NotFoundException(`Ticket '${id}' not found`);
    return ticket;
  }

  @Patch(':id/status')
  async updateStatus(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body('status') nextStatus: TicketStatus,
    @Body('actorId') actorId?: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    if (!nextStatus) throw new BadRequestException('status is required.');
    const updated = await this.service.updateStatus(tenantId, id, nextStatus, actorId || 'system');
    if (!updated) throw new NotFoundException(`Ticket '${id}' not found`);
    return updated;
  }

  @Patch(':id/assign')
  async assignAgent(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body('agentId') agentId: string,
    @Body('agentName') agentName?: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    if (!agentId) throw new BadRequestException('agentId is required.');
    const updated = await this.service.assignAgent(tenantId, id, agentId, agentName);
    if (!updated) throw new NotFoundException(`Ticket '${id}' not found`);
    return updated;
  }

  @Post(':id/comments')
  async addComment(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body()
    body: {
      authorId: string;
      authorName: string;
      authorRole?: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
      body: string;
      isInternal?: boolean;
    },
  ) {
    const tenantId = this.extractTenantId(headers);
    if (!body.body || !body.authorId || !body.authorName) {
      throw new BadRequestException('body, authorId, and authorName are required.');
    }
    return this.service.addComment(tenantId, id, {
      ...body,
      authorRole: body.authorRole || 'AGENT',
    });
  }

  @Get(':id/comments')
  async listComments(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    return this.service.listComments(tenantId, id);
  }

  @Delete(':id')
  async delete(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
  ) {
    const tenantId = this.extractTenantId(headers);
    const success = await this.service.delete(tenantId, id);
    if (!success) throw new NotFoundException(`Ticket '${id}' not found`);
    return { success: true };
  }
}
