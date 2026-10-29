import { OutboxRelay, loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export function loadProcurementCreditRelayConfig(environment: NodeJS.ProcessEnv = process.env) {
  const env = { ...environment };
  if (env.PROCUREMENT_CREDIT_RELAY_URL?.trim() && !env.PROCUREMENT_CREDIT_RELAY_INBOX_PATH?.trim()) {
    env.PROCUREMENT_CREDIT_RELAY_INBOX_PATH = '/business-partners/internal/v1/credit-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'PROCUREMENT_CREDIT_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'PROCUREMENT_CREDIT_RELAY_URL',
    signingKey: 'PROCUREMENT_CREDIT_RELAY_PRIVATE_KEY_BASE64',
    interval: 'PROCUREMENT_CREDIT_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'PROCUREMENT_CREDIT_RELAY_INBOX_PATH',
  });
}

@Injectable()
export class ProcurementCreditVendorBillRelay extends OutboxRelay<
  'relay_lease_credit_vendor_bills' | 'relay_settle_credit_vendor_bill'
> {
  constructor(database: DatabaseService) {
    super(database, loadProcurementCreditRelayConfig(), {
      leaseFunction: 'relay_lease_credit_vendor_bills',
      settleFunction: 'relay_settle_credit_vendor_bill',
      audience: 'gigalibs-business-partners-credit-inbox',
      source: 'universal-procurement',
      notConfiguredMessage: 'Procurement credit relay is not configured; vendor bill AP facts remain queued.',
    });
  }
}
