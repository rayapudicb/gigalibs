import { randomUUID } from 'node:crypto';

const baseUrl = 'http://127.0.0.1:3600';
const tenantId = '9be2289d-04e3-4c10-9208-4cf85a62c7fd';
const subject = 'uat-tax-operator';
const run = Date.now().toString(36).toUpperCase();

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { payload, response };
}

const tokenResponse = await request('oidc/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenant_id: tenantId, sub: subject }),
});
const authorization = `Bearer ${tokenResponse.payload.access_token}`;
const jsonHeaders = { Authorization: authorization, 'Content-Type': 'application/json' };

await request('v1/setup', { method: 'POST', headers: jsonHeaders, body: '{}' });
const jurisdiction = (await request('api/tax/v1/jurisdictions', {
  method: 'POST', headers: jsonHeaders, body: JSON.stringify({
    countryCode: 'US', jurisdictionCode: `UAT-${run}`.slice(0, 16),
    jurisdictionName: `UAT jurisdiction ${run}`, taxType: 'SALES_TAX',
    standardRateBasisPoints: 725, reducedRateBasisPoints: 0,
    hasPhysicalNexus: false, hasEconomicNexus: true,
    economicThresholdRevenueMinor: 10_000_000, economicThresholdTransactions: 200,
  }),
})).payload.data;
await request('api/tax/v1/rates', {
  method: 'POST', headers: jsonHeaders, body: JSON.stringify({
    jurisdictionId: jurisdiction.id, productCategory: 'SERVICES', rateBasisPoints: 825,
    isExempt: false, effectiveFrom: '2026-01-01', effectiveUntil: null,
  }),
});
const exemption = (await request('api/tax/v1/exemptions', {
  method: 'POST', headers: jsonHeaders, body: JSON.stringify({
    customerId: `uat-customer-${run}`, customerName: `UAT Customer ${run}`,
    certificateNumber: `UAT-CERT-${run}`, jurisdictionCode: jurisdiction.jurisdictionCode,
    exemptionReason: 'RESALE_CERTIFICATE', documentUrl: 'https://example.invalid/uat-evidence',
    validFrom: '2026-01-01', validUntil: '2026-12-31',
  }),
})).payload.data;
if (exemption.isVerified || exemption.status !== 'PENDING_REVIEW') {
  throw new Error('New exemption was not contained pending verification.');
}
const verified = (await request(`api/tax/v1/exemptions/${exemption.id}/verify`, {
  method: 'POST', headers: jsonHeaders,
  body: JSON.stringify({ verificationReference: `UAT-REVIEW-${run}` }),
})).payload.data;
if (!verified.isVerified) throw new Error('Authorized verification did not persist.');

const idempotencyKey = `uat-tax-${run}-${randomUUID()}`;
const calculationBody = JSON.stringify({
  sourceModule: 'ACCOUNTS_RECEIVABLE', documentId: `uat-invoice-${run}`,
  documentReference: `UAT-INV-${run}`, jurisdictionCode: jurisdiction.jurisdictionCode,
  productCategory: 'SERVICES', taxableAmountMinor: 100_00,
  transactionDate: '2026-09-11',
});
const first = await request('api/tax/v1/calculate', {
  method: 'POST', headers: { ...jsonHeaders, 'Idempotency-Key': idempotencyKey }, body: calculationBody,
});
const replay = await request('api/tax/v1/calculate', {
  method: 'POST', headers: { ...jsonHeaders, 'Idempotency-Key': idempotencyKey }, body: calculationBody,
});
if (first.payload.data.calculatedTaxMinor !== 825 || replay.response.headers.get('idempotency-replayed') !== 'true') {
  throw new Error('Tax amount or idempotency replay evidence was incorrect.');
}

const unknown = await fetch(`${baseUrl}/api/tax/v1/calculate`, {
  method: 'POST', headers: { ...jsonHeaders, 'Idempotency-Key': `uat-unknown-${run}` },
  body: JSON.stringify({ ...JSON.parse(calculationBody), documentId: `uat-unknown-${run}`, jurisdictionCode: 'UNKNOWN' }),
});
if (unknown.status !== 404) throw new Error(`Unknown jurisdiction returned ${unknown.status}, expected 404.`);

const [ledger, monitor, exemptions] = await Promise.all([
  request('api/tax/v1/ledger', { headers: { Authorization: authorization } }),
  request('api/tax/v1/nexus-status', { headers: { Authorization: authorization } }),
  request('api/tax/v1/exemptions', { headers: { Authorization: authorization } }),
]);
const ledgerRecord = ledger.payload.data.find((row) => row.id === first.payload.data.id);
if (!ledgerRecord) throw new Error('Persisted calculation was absent from the ledger.');

const denied = await fetch(`${baseUrl}/api/tax/v1/ledger`);
if (denied.status !== 401) throw new Error(`Unauthenticated ledger returned ${denied.status}, expected 401.`);
const otherTenantId = '74bf25d5-a197-48df-b11b-fc3622e86cf5';
const otherTokenResponse = await request('oidc/token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenant_id: otherTenantId, sub: subject }),
});
const otherAuthorization = `Bearer ${otherTokenResponse.payload.access_token}`;
await request('v1/setup', {
  method: 'POST', headers: { Authorization: otherAuthorization, 'Content-Type': 'application/json' }, body: '{}',
});
const otherLedger = await request('api/tax/v1/ledger', { headers: { Authorization: otherAuthorization } });
if (otherLedger.payload.data.some((row) => row.id === first.payload.data.id)) {
  throw new Error('Tax calculation crossed the tenant RLS boundary.');
}

console.log(JSON.stringify({
  result: 'PASS', tenantId, jurisdictionId: jurisdiction.id,
  exemptionId: exemption.id, calculationId: first.payload.data.id,
  calculatedTaxMinor: first.payload.data.calculatedTaxMinor,
  idempotencyReplay: true, unknownJurisdictionRejected: true,
  unauthenticatedRejected: true, crossTenantIsolation: true,
  ledgerReadback: true, monitorRows: monitor.payload.data.length,
  exemptionReadback: exemptions.payload.data.some((row) => row.id === exemption.id && row.isVerified),
}, null, 2));
