import { Module } from '@nestjs/common';
import { configProvider } from './config.provider.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { ScannerController } from './scanner/scanner.controller.js';
import { ScannerService } from './scanner/scanner.service.js';

@Module({
  imports: [],
  controllers: [HealthController, ScannerController],
  providers: [configProvider, DatabaseService, ScannerService],
  exports: [DatabaseService, ScannerService],
})
export class AppModule {}
