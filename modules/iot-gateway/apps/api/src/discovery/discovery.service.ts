import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IotPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

const ScanSchema = z.object({ subnetCidr: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/) });

@Injectable()
export class DiscoveryService {
  constructor(private readonly database: DatabaseService) {}

  async scan(principal: IotPrincipal, raw: unknown) {
    const body = ScanSchema.parse(raw ?? {});
    const id = randomUUID();
    const results = [
      { ipAddress: '192.168.1.15:4840', protocol: 'OPC_UA', note: 'Stub scan result — confirm before provisioning.' },
      { ipAddress: '192.168.1.45:502', protocol: 'MODBUS_TCP', note: 'Stub scan result — confirm before provisioning.' },
    ];
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_iot.discovery_scans (tenant_id, id, subnet_cidr, status, results)
         VALUES ($1,$2,$3,'COMPLETED',$4::jsonb)`,
        [principal.tenantId, id, body.subnetCidr, JSON.stringify(results)],
      );
      return { scanId: id, subnetCidr: body.subnetCidr, scannedAt: new Date().toISOString(), results };
    });
  }

  latest(principal: IotPrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, subnet_cidr, results, scanned_at FROM gigalibs_iot.discovery_scans
          WHERE tenant_id = $1 ORDER BY scanned_at DESC LIMIT 1`,
        [principal.tenantId],
      );
      return result.rows[0] ?? { results: [] };
    });
  }
}
