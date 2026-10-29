import type { RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { AtpCheckCommandController } from './atp-check-command.controller.js';
import { ManufacturingAtpCommandGuard } from './manufacturing-atp-command.guard.js';

@Controller('internal/v1/manufacturing-atp-command')
@UseGuards(ManufacturingAtpCommandGuard)
export class ManufacturingAtpCommandController extends AtpCheckCommandController {
  constructor(inventory: InventoryService) { super(inventory); }

  @Post()
  @HttpCode(HttpStatus.OK)
  override execute(@Req() relay: RelayRequest, @Body() body: unknown) {
    return super.execute(relay, body);
  }
}
