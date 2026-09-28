import { Injectable, Logger } from '@nestjs/common';
import type { EsignPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly db: DatabaseService) {}

  async getStatus(
    tenantId: string,
  ): Promise<{
    configured: boolean;
    tenantId: string;
    initializedAt?: string;
    caOrganization?: string;
    fipsComplianceMode?: boolean;
    pkiRootCert?: string;
    rootThumbprint?: string;
    keyUsage?: string;
  }> {
    const result = await this.db.query(
      `SELECT tenant_id, ca_organization, fips_compliance_mode, initialized_at
       FROM gigalibs_esign.tenant_esign_configs
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return { configured: false, tenantId };
    return {
      configured: true,
      tenantId: result.rows[0].tenant_id,
      caOrganization: result.rows[0].ca_organization || 'GigaLibs Enterprise Root CA G2',
      fipsComplianceMode: Boolean(result.rows[0].fips_compliance_mode),
      pkiRootCert: 'GigaLibs Enterprise Root CA G2 (RSA-4096 / SHA-256)',
      rootThumbprint: '8F:3A:91:2E:C4:0B:77:D1:6E:5C:32:FA:18:90:BB:44:03:CD:99:A1',
      keyUsage: 'Digital Signature, Non-Repudiation, Certificate Signing, CRL Signing',
      initializedAt: result.rows[0].initialized_at,
    };
  }

  async setupTenant(
    tenantId: string,
    _principal: EsignPrincipal,
  ): Promise<{ tenantId: string; status: string; created: boolean }> {
    return this.db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO gigalibs_esign.tenant_esign_configs
           (tenant_id, ca_organization, fips_compliance_mode, initialized_at, updated_at)
         VALUES ($1, 'GigaLibs Enterprise Root CA', TRUE, NOW(), NOW())
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING tenant_id`,
        [tenantId],
      );
      const created = inserted.rowCount === 1;

      return {
        tenantId,
        status: 'READY',
        created,
      };
    });
  }
}
