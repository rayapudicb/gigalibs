import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { TicketsService, TICKET_REPOSITORY_TOKEN } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { MemoryTicketRepository, type ITicketRepository } from '@gigalibs/tickets-core';

export interface TicketsModuleOptions {
  repository?: ITicketRepository;
}

@Module({
  controllers: [TicketsController],
  providers: [
    TicketsService,
    {
      provide: TICKET_REPOSITORY_TOKEN,
      useClass: MemoryTicketRepository,
    },
  ],
  exports: [TicketsService, TICKET_REPOSITORY_TOKEN],
})
export class TicketsModule {
  static forRoot(options?: TicketsModuleOptions): DynamicModule {
    const repositoryProvider: Provider = options?.repository
      ? {
          provide: TICKET_REPOSITORY_TOKEN,
          useValue: options.repository,
        }
      : {
          provide: TICKET_REPOSITORY_TOKEN,
          useClass: MemoryTicketRepository,
        };

    return {
      module: TicketsModule,
      controllers: [TicketsController],
      providers: [TicketsService, repositoryProvider],
      exports: [TicketsService, TICKET_REPOSITORY_TOKEN],
    };
  }
}
