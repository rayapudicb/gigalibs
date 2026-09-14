import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = resolve(root, 'docs/audits/2026-09-09-readiness/evidence/uat');
const evidencePath = resolve(evidenceDirectory, 'finance-truth-boundary-result.json');
const tenantId =
  process.env.GIGALIBS_UAT_TENANT_ID?.trim() || '54029e0d-e591-51a6-b93a-94469a87d153';

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function token(baseUrl) {
  const response = await jsonRequest(`${baseUrl}/oidc/token`, {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, sub: 'finance-truth-boundary-check' }),
  });
  if (response.status !== 200 || typeof response.body.access_token !== 'string') {
    throw new Error(`Development token issuance failed at ${baseUrl} (${response.status}).`);
  }
  return response.body.access_token;
}

function assertStatus(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}.`);
}

await mkdir(evidenceDirectory, { recursive: true });

try {
  const currencyBase = 'http://127.0.0.1:3700';
  const recoveryBase = 'http://127.0.0.1:4200';
  const [currencyToken, recoveryToken] = await Promise.all([
    token(currencyBase),
    token(recoveryBase),
  ]);
  const currencyHeaders = { Authorization: `Bearer ${currencyToken}` };
  const recoveryHeaders = { Authorization: `Bearer ${recoveryToken}` };

  const [pairsBefore, ledgerBefore, leaksBefore, scansBefore, claimsBefore] = await Promise.all([
    jsonRequest(`${currencyBase}/v1/pairs`, { headers: currencyHeaders }),
    jsonRequest(`${currencyBase}/v1/ledger`, { headers: currencyHeaders }),
    jsonRequest(`${recoveryBase}/v1/leaks`, { headers: recoveryHeaders }),
    jsonRequest(`${recoveryBase}/v1/scans`, { headers: recoveryHeaders }),
    jsonRequest(`${recoveryBase}/v1/claims`, { headers: recoveryHeaders }),
  ]);
  for (const [label, response] of Object.entries({
    pairsBefore,
    ledgerBefore,
    leaksBefore,
    scansBefore,
    claimsBefore,
  })) {
    assertStatus(label, response.status, 200);
  }

  const [currencySetup, recoverySetup, scanDenied, claimDenied, paymentHoldDenied] =
    await Promise.all([
      jsonRequest(`${currencyBase}/v1/setup`, {
        method: 'POST',
        headers: currencyHeaders,
        body: '{}',
      }),
      jsonRequest(`${recoveryBase}/v1/setup`, {
        method: 'POST',
        headers: recoveryHeaders,
        body: '{}',
      }),
      jsonRequest(`${recoveryBase}/v1/scans`, {
        method: 'POST',
        headers: recoveryHeaders,
        body: '{}',
      }),
      jsonRequest(`${recoveryBase}/v1/claims`, {
        method: 'POST',
        headers: recoveryHeaders,
        body: JSON.stringify({
          leakId: 'nonexistent-finding',
          vendorName: 'boundary-check',
          vendorContactEmail: 'boundary-check@invalid.example',
          claimAmountUsd: 1,
          settlementType: 'CREDIT_MEMO',
          evidencePayload: {},
        }),
      }),
      jsonRequest(`${recoveryBase}/v1/leaks/nonexistent-finding/action`, {
        method: 'POST',
        headers: recoveryHeaders,
        body: JSON.stringify({ action: 'BLOCK_PAYMENT', notes: 'boundary check' }),
      }),
    ]);

  assertStatus('currency setup', currencySetup.status, 200);
  assertStatus('recovery setup', recoverySetup.status, 201);
  assertStatus('scan without source', scanDenied.status, 503);
  assertStatus('claim without provider', claimDenied.status, 503);
  assertStatus('payment hold without provider', paymentHoldDenied.status, 503);

  const [pairsAfter, ledgerAfter, leaksAfter, scansAfter, claimsAfter] = await Promise.all([
    jsonRequest(`${currencyBase}/v1/pairs`, { headers: currencyHeaders }),
    jsonRequest(`${currencyBase}/v1/ledger`, { headers: currencyHeaders }),
    jsonRequest(`${recoveryBase}/v1/leaks`, { headers: recoveryHeaders }),
    jsonRequest(`${recoveryBase}/v1/scans`, { headers: recoveryHeaders }),
    jsonRequest(`${recoveryBase}/v1/claims`, { headers: recoveryHeaders }),
  ]);

  const counts = {
    currencyPairs: [pairsBefore.body.data?.length ?? 0, pairsAfter.body.data?.length ?? 0],
    currencyLedger: [ledgerBefore.body.data?.length ?? 0, ledgerAfter.body.data?.length ?? 0],
    recoveryFindings: [leaksBefore.body.length ?? 0, leaksAfter.body.length ?? 0],
    recoveryScans: [scansBefore.body.length ?? 0, scansAfter.body.length ?? 0],
    recoveryClaims: [claimsBefore.body.length ?? 0, claimsAfter.body.length ?? 0],
  };
  for (const [label, [before, after]] of Object.entries(counts)) {
    if (before !== after) throw new Error(`${label} changed from ${before} to ${after}.`);
  }

  const result = {
    result: 'PASS',
    checkedAt: new Date().toISOString(),
    tenantId,
    counts,
    denials: {
      scanWithoutSource: scanDenied.status,
      claimWithoutProvider: claimDenied.status,
      paymentHoldWithoutProvider: paymentHoldDenied.status,
    },
  };
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const result = {
    result: 'FAIL',
    checkedAt: new Date().toISOString(),
    tenantId,
    error: error instanceof Error ? error.message : String(error),
  };
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
  throw error;
}
