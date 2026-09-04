import { Module, type DynamicModule } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { BillingController } from './billing.controller.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {
  static forRoot(): DynamicModule {
    return {
      module: BillingModule,
      controllers: [BillingController],
      providers: [BillingService],
      exports: [BillingService],
    };
  }
}
