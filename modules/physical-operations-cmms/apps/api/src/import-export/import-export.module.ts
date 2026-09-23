import { Module } from '@nestjs/common';
import { ImportExportController } from './import-export.controller.js';
import { ImportJobService } from './import-job.service.js';
import { ExportJobService } from './export-job.service.js';
import { ImportStorageService } from './import-storage.service.js';
import { AliasResolverService } from './alias-resolver.js';
import { FkResolverService } from './fk-resolver.js';
import { HierarchyResolverService } from './hierarchy-resolver.js';
import { RowValidatorService } from './row-validator.js';
import { BatchWriterService } from './batch-writer.js';
import { IamUserImportService } from './iam-user-import.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ImportExportController],
  providers: [
    ImportJobService,
    ExportJobService,
    ImportStorageService,
    AliasResolverService,
    FkResolverService,
    HierarchyResolverService,
    RowValidatorService,
    BatchWriterService,
    IamUserImportService,
  ],
  exports: [ImportJobService, ExportJobService],
})
export class ImportExportModule {}
