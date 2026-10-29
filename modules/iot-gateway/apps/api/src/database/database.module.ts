import { Global, Module } from '@nestjs/common';
import { iotConfigProvider } from '../config.provider.js';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [iotConfigProvider, DatabaseService],
  exports: [DatabaseService, iotConfigProvider],
})
export class DatabaseModule {}
