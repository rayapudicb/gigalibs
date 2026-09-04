import { Module, type DynamicModule } from '@nestjs/common';
import {
  AI_CHAT_PROVIDER,
  AI_CHAT_REPOSITORY,
  AIChatService,
  type AIChatProvider,
  type AIChatRepository,
} from './ai-chat.service.js';

export interface AIChatModuleOptions {
  provider: AIChatProvider;
  repository: AIChatRepository;
}

@Module({})
export class AIChatModule {
  static forRoot(options: AIChatModuleOptions): DynamicModule {
    return {
      module: AIChatModule,
      providers: [
        { provide: AI_CHAT_PROVIDER, useValue: options.provider },
        { provide: AI_CHAT_REPOSITORY, useValue: options.repository },
        AIChatService,
      ],
      exports: [AIChatService],
    };
  }
}
