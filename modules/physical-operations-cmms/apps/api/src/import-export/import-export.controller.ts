import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { OidcAuthorizationGuard } from '@gigalibs/auth-core/nest';
import { RequirePermissions } from '@gigalibs/auth-core/nest';
import type { AuthenticatedRequest } from '@gigalibs/auth-core';
import { ImportJobService } from './import-job.service.js';
import { ExportJobService } from './export-job.service.js';
import { ImportStorageService } from './import-storage.service.js';
import { generateImportTemplate } from './xlsx-stream-writer.js';
import { listSheetNamesFromBuffer } from './xlsx-multisheet-reader.js';
import { IMPORTABLE_ENTITY_TYPES } from './types.js';
import type { ImportableEntityType, ExportFilters } from './types.js';
import { Queues } from '@gigalibs/queue';
import { createQueue, enqueue } from '@gigalibs/queue';
import Redis from 'ioredis';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

interface InitiateImportDto {
  entityType: ImportableEntityType;
  filename: string;
  historical?: boolean;
  columnMappingOverrides?: Record<string, string>;
}

interface InitiateExportDto {
  entityType: ImportableEntityType;
  filters?: ExportFilters;
  columns?: string[];
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/import-export')
@UseGuards(OidcAuthorizationGuard)
export class ImportExportController {
  private readonly importQueue;
  private readonly exportQueue;

  constructor(
    private readonly importJobService: ImportJobService,
    private readonly exportJobService: ExportJobService,
    private readonly storageService: ImportStorageService,
  ) {
    const redis = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      password: process.env['REDIS_PASSWORD'],
      tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
    });
    this.importQueue = createQueue(Queues.IMPORT_PROCESS, redis);
    this.exportQueue = createQueue(Queues.EXPORT_GENERATE, redis);
  }

  // ──────────────────────── IMPORT ENDPOINTS ────────────────────────────────

  /** POST /v1/import-export/imports  — initiate an import, get presigned upload URL */
  @Post('imports')
  @RequirePermissions('cmms.import.write')
  async initiateImport(@Req() req: AuthenticatedRequest, @Body() dto: InitiateImportDto) {
    const { tenantId, subject: actorId } = req.principal!;
    assertValidEntityType(dto.entityType);

    if (dto.historical) {
      const roles = req.principal!.roles ?? [];
      if (!roles.includes('TENANT_ADMIN') && !roles.includes('PLATFORM_OPERATOR')) {
        throw new ForbiddenException('Historical import requires TENANT_ADMIN or PLATFORM_OPERATOR role');
      }
    }

    const result = await this.importJobService.initiateImport(
      tenantId,
      actorId,
      dto.entityType,
      dto.filename,
      { historical: dto.historical, columnMappingOverrides: dto.columnMappingOverrides },
    );

    return { data: result };
  }

  /** POST /v1/import-export/imports/:jobId/enqueue  — enqueue after client finishes S3 PUT */
  @Post('imports/:jobId/enqueue')
  @RequirePermissions('cmms.import.write')
  async enqueueImport(
    @Req() req: AuthenticatedRequest,
    @Param('jobId') jobId: string,
    @Body() body: { selectedSheets?: string[] } = {},
  ) {
    const { tenantId, subject: actorId } = req.principal!;

    const job = await this.importJobService.getJob(tenantId, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status !== 'PENDING') throw new BadRequestException('Job is not in PENDING status');
    if (!job.s3Key) throw new BadRequestException('No file uploaded for this job');

    // Merge selectedSheets from request body into job options (overrides stored options)
    const mergedOptions = {
      ...job.options,
      ...(body.selectedSheets !== undefined ? { selectedSheets: body.selectedSheets } : {}),
    };

    await enqueue(this.importQueue, 'process', {
      tenantId,
      actorId,
      jobId,
      entityType: job.entityType,
      s3Key: job.s3Key,
      options: mergedOptions,
    });

    return { data: { jobId, queued: true } };
  }

  /** GET /v1/import-export/imports  — list import jobs */
  @Get('imports')
  @RequirePermissions('cmms.import.read')
  async listImports(
    @Req() req: AuthenticatedRequest,
    @Query('entityType') entityType?: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const { tenantId } = req.principal!;
    const et = entityType as ImportableEntityType | undefined;
    if (et) assertValidEntityType(et);
    const jobs = await this.importJobService.listJobs(tenantId, et, limit, offset);
    return { data: jobs };
  }

  /** GET /v1/import-export/imports/:jobId */
  @Get('imports/:jobId')
  @RequirePermissions('cmms.import.read')
  async getImportJob(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    const { tenantId } = req.principal!;
    const job = await this.importJobService.getJob(tenantId, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    return { data: job };
  }

  /** GET /v1/import-export/imports/:jobId/sheets — peek at sheet names in an uploaded file */
  @Get('imports/:jobId/sheets')
  @RequirePermissions('cmms.import.read')
  async getImportSheets(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    const { tenantId } = req.principal!;
    const job = await this.importJobService.getJob(tenantId, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    if (!job.s3Key) throw new BadRequestException('File not yet uploaded for this job');

    // Download the full buffer (SheetJS needs random access for bookSheets peek)
    const stream = await this.importJobService.downloadFileStream(tenantId, job.s3Key);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    const sheetNames = listSheetNamesFromBuffer(buffer);
    return { data: { sheetNames } };
  }

  /** DELETE /v1/import-export/imports/:jobId  — cancel a pending/awaiting-review job */
  @Delete('imports/:jobId')
  @RequirePermissions('cmms.import.write')
  async cancelImport(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    const { tenantId } = req.principal!;
    await this.importJobService.cancelJob(tenantId, jobId);
    return { data: { cancelled: true } };
  }

  // ──────────────────────── EXPORT ENDPOINTS ────────────────────────────────

  /** POST /v1/import-export/exports */
  @Post('exports')
  @RequirePermissions('cmms.export.write')
  async initiateExport(@Req() req: AuthenticatedRequest, @Body() dto: InitiateExportDto) {
    const { tenantId, subject: actorId, departmentScope } = req.principal!;
    assertValidEntityType(dto.entityType);

    const { jobId } = await this.exportJobService.initiateExport(
      tenantId,
      actorId,
      dto.entityType,
      dto.filters ?? {},
    );

    await enqueue(this.exportQueue, 'generate', {
      tenantId,
      actorId,
      jobId,
      entityType: dto.entityType,
      filters: dto.filters ?? {},
      allowedColumns: dto.columns ?? [],
      departmentScope: departmentScope ?? null,
    });

    return { data: { jobId } };
  }

  /** GET /v1/import-export/exports/:jobId */
  @Get('exports/:jobId')
  @RequirePermissions('cmms.export.read')
  async getExportJob(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    const { tenantId } = req.principal!;
    const job = await this.exportJobService.getJob(tenantId, jobId);
    if (!job) throw new NotFoundException('Export job not found');
    return { data: job };
  }

  /** GET /v1/import-export/exports */
  @Get('exports')
  @RequirePermissions('cmms.export.read')
  async listExports(
    @Req() req: AuthenticatedRequest,
    @Query('entityType') entityType?: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25,
  ) {
    const { tenantId } = req.principal!;
    const et = entityType as ImportableEntityType | undefined;
    if (et) assertValidEntityType(et);
    const jobs = await this.exportJobService.listJobs(tenantId, et, limit);
    return { data: jobs };
  }

  // ──────────────────────── TEMPLATE ENDPOINT ───────────────────────────────

  /** GET /v1/import-export/templates/:entityType */
  @Get('templates/:entityType')
  @RequirePermissions('cmms.import.read')
  async downloadTemplate(@Req() req: AuthenticatedRequest, @Param('entityType') entityType: string) {
    assertValidEntityType(entityType as ImportableEntityType);
    const buffer = await generateImportTemplate(entityType as ImportableEntityType);
    void req;
    // Return raw buffer — NestJS will serialize this as application/octet-stream
    // In production, configure response headers via interceptor or @Res()
    return buffer;
  }

  // ──────────────────────── COLUMN ALIAS ENDPOINTS ─────────────────────────

  /** GET /v1/import-export/presign/:jobId/error-report */
  @Get('presign/:jobId/error-report')
  @RequirePermissions('cmms.import.read')
  async getErrorReportUrl(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
    const { tenantId } = req.principal!;
    const job = await this.importJobService.getJob(tenantId, jobId);
    if (!job) throw new NotFoundException('Import job not found');
    if (!job.errorReportS3Key) throw new NotFoundException('No error report for this job');
    const { downloadUrl, expiresAt } = await this.storageService.createPresignedDownload(
      job.errorReportS3Key,
    );
    return { data: { downloadUrl, expiresAt } };
  }
}

// ─── Guard helper ─────────────────────────────────────────────────────────────

function assertValidEntityType(entityType: string): asserts entityType is ImportableEntityType {
  if (!(IMPORTABLE_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new BadRequestException(
      `Invalid entityType "${entityType}". Must be one of: ${IMPORTABLE_ENTITY_TYPES.join(', ')}`,
    );
  }
}
