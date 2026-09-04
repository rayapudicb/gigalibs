import { Module, type DynamicModule } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { StorageController } from './storage.controller.js';

@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      controllers: [StorageController],
      providers: [StorageService],
      exports: [StorageService],
    };
  }
}
