import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
import {
  type FamilyItemResponse,
  type GeneratedInvoiceFamilyResponse,
  type WorkSourceSummaryResponse,
  WorkSourcesService,
} from './work-sources.service.js';

interface PassthroughResponse {
  status(code: number): void;
}

@Controller('v1/work-sources')
@UseGuards(ArAuthorizationGuard)
export class WorkSourcesController {
  constructor(@Inject(WorkSourcesService) private readonly workSources: WorkSourcesService) {}

  @Post()
  @RequirePermissions('ar.invoices.write')
  async createWorkSource(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<{ id: string; name: string; sourceReference: string }> {
    const result = await this.workSources.createWorkSource(body, requirePrincipal(request));
    response.status(201);
    return result;
  }

  @Post(':id/records')
  @RequirePermissions('ar.invoices.write')
  async ingestRecords(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<{ ingested: number }> {
    const result = await this.workSources.ingestRecords(id, body, requirePrincipal(request));
    response.status(201);
    return result;
  }

  @Get(':id/summary')
  @RequirePermissions('ar.invoices.read')
  async getSummary(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkSourceSummaryResponse> {
    return this.workSources.getSummary(id, requirePrincipal(request));
  }

  @Post(':id/generate-invoice')
  @RequirePermissions('ar.invoices.write')
  async generateInvoice(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<GeneratedInvoiceFamilyResponse> {
    const result = await this.workSources.generateInvoice(
      id,
      body,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.status(201);
    return result;
  }

  @Get(':id/family')
  @RequirePermissions('ar.invoices.read')
  async getFamily(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ items: FamilyItemResponse[] }> {
    return this.workSources.getFamily(id, requirePrincipal(request));
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
