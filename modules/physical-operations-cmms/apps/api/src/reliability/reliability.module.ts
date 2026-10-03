import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ReliabilityController } from './reliability.controller.js';
import { ReliabilityService } from './reliability.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ReliabilityController],
  providers: [ReliabilityService],
  exports: [ReliabilityService],
})
export class ReliabilityModule {}
