import { RelayEnvelopeV1Schema, type RelayEnvelopeV1 } from '@gigalibs/contracts';
import {
  RelayInboxGuardBase,
  type RelayConfig,
  type RelayRequest,
  loadRelayConfig,
} from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProcurementService } from '../procurement/procurement.service.js';

export const PROCUREMENT_INBOX_AUDIENCE = 'gigalibs-procurement-inbox';
export const PROCUREMENT_INVENTORY_RELAY_CONFIG = Symbol('PROCUREMENT_INVENTORY_RELAY_CONFIG');

export function loadProcurementInventoryRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'PROCUREMENT_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'PROCUREMENT_INVENTORY_OUTBOUND_UNUSED',
    signingKey: 'PROCUREMENT_INVENTORY_OUTBOUND_UNUSED',
    interval: 'PROCUREMENT_RELAY_INTERVAL_MS',
    peerService: 'universal-inventory-api',
  });
}

@Injectable()
export class ProcurementInventoryInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(PROCUREMENT_INVENTORY_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: PROCUREMENT_INBOX_AUDIENCE, source: 'inventory', label: 'Procurement (Inventory drafts)' });
  }
}

@Controller('internal/v1/inbox')
@UseGuards(ProcurementInventoryInboxGuard)
export class ProcurementInventoryInboxController {
  constructor(@Inject(ProcurementService) private readonly procurement: ProcurementService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    const parsed = RelayEnvelopeV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid relay envelope.');
    }
    return this.procurement.applyReplenishmentPoDraft(parsed.data, request.rawBody?.toString('utf8') ?? JSON.stringify(body));
  }
}

@Module({
  controllers: [ProcurementInventoryInboxController],
  providers: [
    { provide: PROCUREMENT_INVENTORY_RELAY_CONFIG, useFactory: () => loadProcurementInventoryRelayConfig() },
    ProcurementInventoryInboxGuard,
  ],
})
export class ProcurementInventoryInboxModule {}
