import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller.js';
import { ConnectorService } from './connector.service.js';

@Module({
  controllers: [ConnectorController],
  providers: [ConnectorService],
  exports: [ConnectorService],
})
export class ConnectorModule {}
