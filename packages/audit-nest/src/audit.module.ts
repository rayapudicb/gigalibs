import { Module, type DynamicModule } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {
  static forRoot(): DynamicModule {
    return {
      module: AuditModule,
      controllers: [AuditController],
      providers: [AuditService],
      exports: [AuditService],
    };
  }
}
