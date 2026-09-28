import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
  type ScannerPrincipal,
} from '../auth/authorization.js';
import { ScannerService } from './scanner.service.js';

export interface UploadDocumentDto {
  fileName: string;
  mimeType: string;
  base64Content?: string;
  textContent?: string;
}

export interface ExtractDocumentDto {
  documentId?: string;
  modelAdapter?: string;
  rawTextContent?: string;
}

export interface CorrectJobDto {
  correctedFields: Record<string, any>;
}

export interface HandoffJobDto {
  target?: 'ACCOUNTS_PAYABLE' | 'SPEND_MANAGEMENT';
}

@Controller('v1/scanner')
@UseGuards(OidcAuthorizationGuard)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('upload')
  @RequirePermissions('documents:create')
  async upload(
    @Principal() principal: ScannerPrincipal,
    @Body() body: UploadDocumentDto,
  ) {
    if (!body || !body.fileName) {
      throw new BadRequestException('fileName is required.');
    }

    let buffer: Buffer;
    if (body.base64Content) {
      buffer = Buffer.from(body.base64Content, 'base64');
    } else if (body.textContent) {
      buffer = Buffer.from(body.textContent, 'utf-8');
    } else {
      throw new BadRequestException('base64Content or textContent must be provided.');
    }

    return this.scannerService.uploadDocument(principal.tenantId, principal.userId, {
      buffer,
      originalName: body.fileName,
      mimeType: body.mimeType || 'application/pdf',
    });
  }

  @Post('extract')
  @RequirePermissions('documents:create')
  async extract(
    @Principal() principal: ScannerPrincipal,
    @Body() body: ExtractDocumentDto,
  ) {
    return this.scannerService.extractDocument(
      principal.tenantId,
      body?.documentId || 'temp-doc-id',
      body?.modelAdapter || 'GIGALIBS_OCR_V1',
      body?.rawTextContent,
    );
  }

  @Get('jobs')
  @RequirePermissions('documents:read')
  async listJobs(@Principal() principal: ScannerPrincipal) {
    return this.scannerService.getJobs(principal.tenantId);
  }

  @Get('jobs/:id')
  @RequirePermissions('documents:read')
  async getJob(
    @Principal() principal: ScannerPrincipal,
    @Param('id') id: string,
  ) {
    return this.scannerService.getJob(principal.tenantId, id);
  }

  @Patch('jobs/:id/correct')
  @RequirePermissions('documents:create')
  async correct(
    @Principal() principal: ScannerPrincipal,
    @Param('id') id: string,
    @Body() body: CorrectJobDto,
  ) {
    return this.scannerService.correctJob(principal.tenantId, id, body?.correctedFields || {});
  }

  @Post('jobs/:id/handoff')
  @RequirePermissions('documents:create')
  async handoff(
    @Principal() principal: ScannerPrincipal,
    @Param('id') id: string,
    @Body() body?: HandoffJobDto,
  ) {
    return this.scannerService.handoffJob(
      principal.tenantId,
      principal.userId,
      id,
      body?.target || 'ACCOUNTS_PAYABLE',
    );
  }
}
