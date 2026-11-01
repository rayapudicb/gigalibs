import { Module } from '@nestjs/common';
import { SourceAccessService } from './source-access.service.js';

@Module({
  providers: [SourceAccessService],
  exports: [SourceAccessService],
})
export class SourceAccessModule {}
