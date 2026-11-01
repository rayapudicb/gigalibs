import { RoundInspectionTrendQueryV1, RoundInspectionTrendV1, type RoundInspectionTrendV1 as Trend } from '@gigalibs/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { resolveOrganizationAccess } from '../organization/organization-scope.js';
import { resolvePlaceScope } from '../places/place-scope.js';

/** Rounds facts live in Analytics' own inbox. Scoped members never see legacy facts lacking owner/place provenance. */
@Injectable()
export class InspectionTrendService {
  constructor(private readonly database:DatabaseService) {}

  async get(principal:AnalyticsPrincipal,raw:unknown):Promise<Trend> {
    const parsed=RoundInspectionTrendQueryV1.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Supply valid asset and checkpoint IDs.');
    const {assetId,checkpointId,unitCode}=parsed.data;
    const now=new Date();
    const to=now.toISOString().slice(0,10);
    const from=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-89))
      .toISOString().slice(0,10);
    const fromInstant=`${from}T00:00:00.000Z`;
    const untilInstant=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString();
    const empty=() => RoundInspectionTrendV1.parse({contractVersion:'round-inspection-trend.v1',
      assetId,checkpointId,unitCode,from,to,generatedAt:now.toISOString(),source:'ANALYTICS_ROUNDS_FACTS',days:[]});
    const [organization,places]=await Promise.all([
      resolveOrganizationAccess(this.database,principal),resolvePlaceScope(this.database,principal),
    ]);
    if (organization?.denied || (places && places.placeIds.length===0)) return empty();
    const units=organization?.readUnits ?? null;
    type Row={day:string;unit_code:string;average:string;minimum:string;maximum:string;
      sample_count:number;last_accepted_at:Date};
    const result=await this.database.queryWithTenant<Row>(principal.tenantId,
      `WITH facts AS (
         SELECT DISTINCT ON (r.source_pk_hash) r.raw_payload
           FROM gigalibs_analytics.raw_record_versions r
           JOIN gigalibs_analytics.source_connections s
             ON s.id=r.connection_id AND s.tenant_id=r.tenant_id
          WHERE r.tenant_id=$1 AND s.module_source_key='operator-rounds:readings'
            AND r.source_table_name='inspection_readings'
            AND r.raw_payload->>'scopeKnown'='true'
            AND r.raw_payload->>'source'='MANUAL'
            AND r.raw_payload->>'assetId'=$2
            AND r.raw_payload->>'checkpointId'=$3
            AND r.raw_payload->>'unitCode'=$4
            AND r.raw_payload->>'numericValue' IS NOT NULL
            AND ($5::text[] IS NULL OR r.raw_payload->>'owningUnitId' IS NULL
                 OR r.raw_payload->>'owningUnitId'=ANY($5::text[]))
            AND ($6::text[] IS NULL OR r.raw_payload->>'placeRef'=ANY($6::text[]))
            AND (r.raw_payload->>'capturedAt')::timestamptz >= $7::timestamptz
            AND (r.raw_payload->>'capturedAt')::timestamptz < $8::timestamptz
          ORDER BY r.source_pk_hash,r.ingested_at DESC,r.id DESC
       )
       SELECT to_char(((f.raw_payload->>'capturedAt')::timestamptz AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day,
              f.raw_payload->>'unitCode' AS unit_code,
              round(avg((f.raw_payload->>'numericValue')::numeric),6)::text AS average,
              min((f.raw_payload->>'numericValue')::numeric)::text AS minimum,
              max((f.raw_payload->>'numericValue')::numeric)::text AS maximum,
              count(*)::int AS sample_count,
              max((f.raw_payload->>'acceptedAt')::timestamptz) AS last_accepted_at
         FROM facts f
        GROUP BY 1,2 ORDER BY 1 LIMIT 91`,
      [principal.tenantId,assetId,checkpointId,unitCode,units,places?.placeIds ?? null,fromInstant,untilInstant]);
    return RoundInspectionTrendV1.parse({contractVersion:'round-inspection-trend.v1',
      assetId,checkpointId,unitCode,from,to,generatedAt:now.toISOString(),source:'ANALYTICS_ROUNDS_FACTS',
      days:result.rows.map((row) => ({day:row.day,unitCode:row.unit_code,
        average:row.average,minimum:row.minimum,maximum:row.maximum,
        sampleCount:row.sample_count,lastAcceptedAt:row.last_accepted_at.toISOString()}))});
  }
}
