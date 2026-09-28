import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';
import { VaultCryptoService } from './vault-crypto.service.js';

@Module({
  controllers: [ConnectorsController],
  providers: [ConnectorsService, VaultCryptoService],
  exports: [ConnectorsService, VaultCryptoService],
})
export class ConnectorsModule {}
