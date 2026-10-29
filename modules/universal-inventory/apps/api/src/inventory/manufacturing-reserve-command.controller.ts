import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { ReserveReleaseCommandController } from './reserve-release-command.controller.js';
import { ManufacturingReserveCommandGuard } from './manufacturing-reserve-command.guard.js';

/** A separate signed inbox prevents Manufacturing from impersonating the Orders reserve relay. */
@Controller('internal/v1/manufacturing-reserve-command')
@UseGuards(ManufacturingReserveCommandGuard)
export class ManufacturingReserveCommandController extends ReserveReleaseCommandController {
  constructor(inventory: InventoryService) {
    super(inventory);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  override execute(@Req() relay: RelayRequest, @Body() body: unknown) {
    return super.execute(relay, body);
  }
}
