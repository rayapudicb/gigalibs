import { Module } from '@nestjs/common';
import { EamSpacesController } from './spaces.controller.js';
import { EamSpacesService } from './spaces.service.js';

@Module({
  controllers: [EamSpacesController],
  providers: [EamSpacesService],
  exports: [EamSpacesService],
})
export class EamSpacesModule {}
