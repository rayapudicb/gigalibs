import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
  type OntologyPrincipal,
} from '../auth/authorization.js';
import { OntologyService } from './ontology.service.js';

@Controller('api/v1/ontology')
@UseGuards(OidcAuthorizationGuard)
export class OntologyController {
  constructor(private readonly ontologyService: OntologyService) {}

  // ── Parties ─────────────────────────────────────────────────────────────────

  @Get('parties')
  @RequirePermissions('ontology:read')
  async listParties(@Principal() principal: OntologyPrincipal) {
    return this.ontologyService.getParties(principal.tenantId);
  }

  @Post('parties')
  @RequirePermissions('ontology:write')
  async createParty(
    @Principal() principal: OntologyPrincipal,
    @Body() body: any,
  ) {
    if (!body?.code || !body?.name || !body?.category) {
      throw new BadRequestException('code, name, and category are required.');
    }
    return this.ontologyService.createParty(principal.tenantId, body);
  }

  @Get('parties/:code/360')
  @RequirePermissions('ontology:read')
  async getParty360(
    @Principal() principal: OntologyPrincipal,
    @Param('code') code: string,
  ) {
    const view = await this.ontologyService.getParty360(principal.tenantId, code);
    if (!view) throw new NotFoundException(`Party '${code}' not found.`);
    return view;
  }

  // ── Agreements ───────────────────────────────────────────────────────────────

  @Get('agreements')
  @RequirePermissions('ontology:read')
  async listAgreements(@Principal() principal: OntologyPrincipal) {
    return this.ontologyService.getAgreements(principal.tenantId);
  }

  @Post('agreements')
  @RequirePermissions('ontology:write')
  async createAgreement(
    @Principal() principal: OntologyPrincipal,
    @Body() body: any,
  ) {
    if (!body?.code || !body?.title || !body?.party_code || !body?.type) {
      throw new BadRequestException('code, title, party_code, and type are required.');
    }
    return this.ontologyService.createAgreement(principal.tenantId, body);
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  @Get('transactions')
  @RequirePermissions('ontology:read')
  async listTransactions(@Principal() principal: OntologyPrincipal) {
    return this.ontologyService.getTransactions(principal.tenantId);
  }

  @Post('transactions')
  @RequirePermissions('ontology:write')
  async createTransaction(
    @Principal() principal: OntologyPrincipal,
    @Body() body: any,
  ) {
    if (!body?.code || !body?.party_code || !body?.agreement_code || !body?.type) {
      throw new BadRequestException('code, party_code, agreement_code, and type are required.');
    }
    return this.ontologyService.createTransaction(principal.tenantId, body);
  }

  // ── Assets ───────────────────────────────────────────────────────────────────

  @Get('assets')
  @RequirePermissions('ontology:read')
  async listAssets(@Principal() principal: OntologyPrincipal) {
    return this.ontologyService.getAssets(principal.tenantId);
  }

  @Post('assets')
  @RequirePermissions('ontology:write')
  async createAsset(
    @Principal() principal: OntologyPrincipal,
    @Body() body: any,
  ) {
    if (!body?.code || !body?.name || !body?.category || !body?.party_code || !body?.agreement_code) {
      throw new BadRequestException('code, name, category, party_code, and agreement_code are required.');
    }
    return this.ontologyService.createAsset(principal.tenantId, body);
  }

  // ── Graph Summary ─────────────────────────────────────────────────────────────

  @Get('graph')
  @RequirePermissions('ontology:read')
  async getGraph(@Principal() principal: OntologyPrincipal) {
    return this.ontologyService.getGraph(principal.tenantId);
  }
}
