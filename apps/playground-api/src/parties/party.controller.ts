import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { CurrentUser } from '@gigalibs/auth-nest';
import { CurrentTenant } from '@gigalibs/tenancy-nest';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { PartyService } from './party.service.js';
import type {
  CreatePartyInputV1,
  UpdatePartyInputV1,
  ArchivePartyInputV1,
  MergePreviewInputV1,
  MergePartiesInputV1,
  AddPartyRoleInputV1,
  UpdatePartyRoleInputV1,
  AddPartyAddressInputV1,
  UpdatePartyAddressInputV1,
  AddPartyContactInputV1,
  UpdatePartyContactInputV1,
  AddPartyIdentifierInputV1,
  AssignPartyOrgInputV1,
  PartyListQueryV1,
} from '@gigalibs/contracts';

@Controller('parties')
export class PartyController {
  constructor(private readonly partyService: PartyService) {}

  @Get()
  @RequirePermissions('parties:read')
  async listParties(
    @CurrentTenant('tenantId') tenantId: string,
    @Query() query: PartyListQueryV1,
  ) {
    return this.partyService.listParties(tenantId, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('parties:create')
  async createParty(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body() body: CreatePartyInputV1,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.partyService.createParty(tenantId, actorId ?? 'system-actor', body, idempotencyKey);
  }

  @Get(':partyId')
  @RequirePermissions('parties:read')
  async getParty(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('partyId') partyId: string,
  ) {
    return this.partyService.getPartyDetail(tenantId, partyId);
  }

  @Patch(':partyId')
  @RequirePermissions('parties:update')
  async updateParty(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: UpdatePartyInputV1,
  ) {
    return this.partyService.updateParty(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/archive')
  @RequirePermissions('parties:archive')
  async archiveParty(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: ArchivePartyInputV1,
  ) {
    return this.partyService.archiveParty(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/restore')
  @RequirePermissions('parties:archive')
  async restoreParty(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
  ) {
    return this.partyService.restoreParty(tenantId, partyId, actorId ?? 'system-actor');
  }

  @Post(':partyId/merge-preview')
  @RequirePermissions('parties:merge')
  async previewMerge(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('partyId') partyId: string,
    @Body() body: MergePreviewInputV1,
  ) {
    return this.partyService.previewMerge(tenantId, partyId, body.targetPartyId);
  }

  @Post(':partyId/merge')
  @RequirePermissions('parties:merge')
  async mergeParties(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: MergePartiesInputV1,
  ) {
    return this.partyService.mergeParties(tenantId, actorId ?? 'system-actor', {
      ...body,
      sourcePartyId: partyId,
    });
  }

  @Post(':partyId/roles')
  @RequirePermissions('parties:update')
  async addRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: AddPartyRoleInputV1,
  ) {
    return this.partyService.addRole(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Patch(':partyId/roles/:roleId')
  @RequirePermissions('parties:update')
  async updateRole(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Param('roleId') roleId: string,
    @Body() body: UpdatePartyRoleInputV1,
  ) {
    return this.partyService.updateRole(tenantId, partyId, roleId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/addresses')
  @RequirePermissions('parties:update')
  async addAddress(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: AddPartyAddressInputV1,
  ) {
    return this.partyService.addAddress(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Patch(':partyId/addresses/:addressId')
  @RequirePermissions('parties:update')
  async updateAddress(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Param('addressId') addressId: string,
    @Body() body: UpdatePartyAddressInputV1,
  ) {
    return this.partyService.updateAddress(tenantId, partyId, addressId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/contacts')
  @RequirePermissions('parties:update')
  async addContact(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: AddPartyContactInputV1,
  ) {
    return this.partyService.addContact(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Patch(':partyId/contacts/:contactId')
  @RequirePermissions('parties:update')
  async updateContact(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Param('contactId') contactId: string,
    @Body() body: UpdatePartyContactInputV1,
  ) {
    return this.partyService.updateContact(tenantId, partyId, contactId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/identifiers')
  @RequirePermissions('parties:identifiers.manage')
  async addIdentifier(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: AddPartyIdentifierInputV1,
  ) {
    return this.partyService.addIdentifier(tenantId, partyId, actorId ?? 'system-actor', body);
  }

  @Post(':partyId/org-assignments')
  @RequirePermissions('parties:update')
  async assignOrgUnit(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('partyId') partyId: string,
    @Body() body: AssignPartyOrgInputV1,
  ) {
    return this.partyService.assignOrgUnit(tenantId, partyId, actorId ?? 'system-actor', body);
  }
}
