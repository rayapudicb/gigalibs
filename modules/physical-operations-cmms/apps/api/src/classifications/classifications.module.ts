import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ClassificationsController } from './classifications.controller.js';
import { ClassificationsService } from './classifications.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ClassificationsController],
  providers: [ClassificationsService],
  exports: [ClassificationsService],
})
export class ClassificationsModule {}
