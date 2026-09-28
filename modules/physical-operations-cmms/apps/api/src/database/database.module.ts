import { Module } from '@nestjs/common';
import { CMMS_CONFIG, cmmsConfigProvider } from '../config.provider.js';
import { DatabaseService } from './database.service.js';

@Module({
  providers: [cmmsConfigProvider, DatabaseService],
  exports: [CMMS_CONFIG, DatabaseService],
})
export class DatabaseModule {}
