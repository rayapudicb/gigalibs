import { Module, Global } from '@nestjs/common';
import { arModuleRuntimeConfigProvider } from '../config.module-sdk.js';
import { arConfigProvider } from '../config.provider.js';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [arConfigProvider, arModuleRuntimeConfigProvider, DatabaseService],
  exports: [arConfigProvider, arModuleRuntimeConfigProvider, DatabaseService],
})
export class DatabaseModule {}
