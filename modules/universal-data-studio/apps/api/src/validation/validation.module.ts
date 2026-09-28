import { Module } from '@nestjs/common';
import { ValidationController } from './validation.controller.js';
import { ValidationService } from './validation.service.js';

@Module({
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
