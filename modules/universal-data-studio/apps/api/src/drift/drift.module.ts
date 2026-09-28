import { Module } from '@nestjs/common';
import { DriftController } from './drift.controller.js';
import { DriftService } from './drift.service.js';

@Module({
  controllers: [DriftController],
  providers: [DriftService],
  exports: [DriftService],
})
export class DriftModule {}
