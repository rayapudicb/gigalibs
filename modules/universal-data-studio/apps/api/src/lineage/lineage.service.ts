import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class LineageService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * DS-05: Derive lineage DAG dynamically from committed tenant contracts, mappings, and connections.
   * An empty tenant returns an empty graph.
   */
  async getLineageGraph(tenantId: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const contractsRes = await this.db.query(
      `SELECT id, contract_code, name, domain, active_version, compatibility_mode, status
       FROM gigalibs_data_studio.data_contracts
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const mappingsRes = await this.db.query(
      `SELECT fm.id, fm.mapping_name, fm.source_system, fm.target_currency, fm.currency_normalization, c.contract_code, c.domain
       FROM gigalibs_data_studio.field_mappings fm
       JOIN gigalibs_data_studio.data_contracts c ON fm.contract_id = c.id
       WHERE c.tenant_id = $1`,
      [tenantId],
    );

    // If tenant has no data, return clean empty graph
    if (contractsRes.rowCount === 0 && mappingsRes.rowCount === 0) {
      return {
        success: true,
        tenant_id: tenantId,
        nodes: {
          upstream_sources: [],
          data_contracts: [],
          field_mappings: [],
          downstream_modules: [],
        },
        edges: [],
      };
    }

    // 1. Derive upstream sources dynamically from tenant's field mappings
    const distinctSources = new Set<string>();
    for (const m of mappingsRes.rows) {
      if (m.source_system) distinctSources.add(m.source_system);
    }

    const upstreamSources = Array.from(distinctSources).map((src) => ({
      id: `src-${src.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: src,
      type: 'UPSTREAM_SOURCE',
      protocol: src.includes('WEBHOOK') ? 'REST Webhook' : src.includes('SAP') ? 'OData / RFC' : 'Managed Feed',
    }));

    // 2. Derive downstream consumers dynamically from contract domains
    const domainModuleMap: Record<string, { id: string; name: string; schema: string }> = {
      'FINANCE': { id: 'mod-ar', name: 'Accounts Receivable & General Ledger', schema: 'gigalibs_ar' },
      'PROCUREMENT': { id: 'mod-spend', name: 'Spend Management & Procurement', schema: 'gigalibs_spend' },
      'TAX': { id: 'mod-tax', name: 'Tax Nexus & Jurisdiction Engine', schema: 'gigalibs_tax' },
      'TREASURY': { id: 'mod-curr', name: 'MultiCurrency Treasury', schema: 'gigalibs_currency' },
      'WORKFLOW': { id: 'mod-workflow', name: 'Workflow Studio Orchestrator', schema: 'public' },
    };

    const downstreamModules: any[] = [];
    const seenDownstreams = new Set<string>();

    for (const c of contractsRes.rows) {
      const dm = domainModuleMap[c.domain.toUpperCase()] || {
        id: `mod-${c.domain.toLowerCase()}`,
        name: `${c.domain} Operational Module`,
        schema: `gigalibs_${c.domain.toLowerCase()}`,
      };
      if (!seenDownstreams.has(dm.id)) {
        seenDownstreams.add(dm.id);
        downstreamModules.push(dm);
      }
    }

    // 3. Construct edges dynamically
    const edges: Array<{ from: string; to: string; transform?: string; channel: string }> = [];

    for (const m of mappingsRes.rows) {
      const srcId = `src-${m.source_system.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      edges.push({
        from: srcId,
        to: m.contract_code,
        transform: m.mapping_name,
        channel: m.currency_normalization ? 'Transform & FX Normalize' : 'Declarative Transform',
      });
    }

    for (const c of contractsRes.rows) {
      const dm = domainModuleMap[c.domain.toUpperCase()];
      if (dm) {
        edges.push({
          from: c.contract_code,
          to: dm.id,
          channel: 'ACID Validated Write',
        });
      }
    }

    return {
      success: true,
      tenant_id: tenantId,
      nodes: {
        upstream_sources: upstreamSources,
        data_contracts: contractsRes.rows,
        field_mappings: mappingsRes.rows,
        downstream_modules: downstreamModules,
      },
      edges,
    };
  }
}
