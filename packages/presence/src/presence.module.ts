import { Module, type DynamicModule } from '@nestjs/common';
import { PresenceService } from './presence.service.js';

@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {
  static forRoot(): DynamicModule {
    return {
      module: PresenceModule,
      providers: [PresenceService],
      exports: [PresenceService],
    };
  }
}
