import { SignedContextGuardBase } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { loadConnectorHubRuntimeConfig } from '../runtime-config.js';

/** The catalogue entry whose entitlement the signed context must carry. */
export const CONNECTOR_HUB_MODULE_KEY = 'connections';

/**
 * WI-OI-104a: tenant authority only from a PlatformContextV1 the web BFF signed for Connector Hub (module SDK), with
 * each route's permission checked against the verified scopes. A caller-supplied tenant header is never read.
 */
@Injectable()
export class ConnectorHubAuthorizationGuard extends SignedContextGuardBase {
  constructor(database: DatabaseService) {
    const config = loadConnectorHubRuntimeConfig();
    super(
      {
        label: 'Connector Hub',
        moduleKey: CONNECTOR_HUB_MODULE_KEY,
        entitlementName: 'Connections',
        permissionPrefix: 'connections',
        publicKey: config.platformContextPublicKey,
        audience: config.platformContextAudience,
      },
      database,
    );
  }
}
