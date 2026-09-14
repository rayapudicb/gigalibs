import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { arConfigProvider } from '../config.provider.js';

@Global()
@Module({
  providers: [arConfigProvider, DatabaseService],
  exports: [arConfigProvider, DatabaseService],
})
export class DatabaseModule {}
