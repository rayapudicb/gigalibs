// WI-OI-083d live proof: a web image built for the `proof-without-cmms` solution, against the full web as control.
// Usage: node verify-solution-web.mjs <creds.json> <solution web url> <full web url>
import { readFileSync } from 'node:fs';

const [, , credsPath, solutionUrl, fullUrl] = process.argv;
const creds = JSON.parse(readFileSync(credsPath, 'utf8').trim().split('\n').pop());
const ID = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';

async function login(url) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: url },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    redirect: 'manual',
  });
  if (response.status !== 200) throw new Error(`login at ${url}: ${response.status}`);
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

const rows = [];
let failed = 0;
async function check(label, url, cookie, path, { method = 'GET', status, lacks = [], has = [] }) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { Cookie: cookie, Origin: url, Accept: 'application/json, text/html' },
    redirect: 'manual',
  });
  const body = await response.text();
  const problems = [];
  if (response.status !== status) problems.push(`status ${response.status}, expected ${status}`);
  for (const text of lacks) if (body.includes(text)) problems.push(`contains "${text}"`);
  for (const text of has) if (!body.includes(text)) problems.push(`lacks "${text}"`);
  if (problems.length) failed += 1;
  rows.push(`${problems.length ? 'FAIL' : 'ok  '} ${label}: ${method} ${path} → ${response.status}${problems.length ? ` (${problems.join('; ')})` : ''}`);
}

const solution = await login(solutionUrl);
const full = await login(fullUrl);
const cmmsText = ['href="/cmms', 'EAM Operations Console', 'Asset &amp; Maintenance (CMMS)', 'CMMS Board'];

for (const path of ['/cmms', '/cmms/work-orders', '/cmms/requests/portal']) {
  await check('solution', solutionUrl, solution, path, { status: 404 });
  await check('full (control)', fullUrl, full, path, { status: 200 });
}
const workOrder = `/api/cmms/v1/work-orders/${creds.workOrderId}`;
await check('solution', solutionUrl, solution, workOrder, { status: 404, has: ['GATEWAY_UNKNOWN'] });
await check('full (control)', fullUrl, full, workOrder, { status: 200 });
// Listing work orders was never on the CMMS allow-list: the full web refuses it, the solution has no CMMS gateway.
await check('solution', solutionUrl, solution, '/api/cmms/v1/work-orders', { status: 404, has: ['GATEWAY_UNKNOWN'] });
await check('full (control)', fullUrl, full, '/api/cmms/v1/work-orders', { status: 404, has: ['CMMS_ROUTE_UNSUPPORTED'] });
await check('solution', solutionUrl, solution, `/api/cmms/work-orders/${ID}/financials`, { status: 404 });
await check('full (control)', fullUrl, full, `/api/cmms/work-orders/${ID}/financials`, { status: 503, has: ['CAPABILITY_UNAVAILABLE'] });
for (const [url, cookie, label] of [[solutionUrl, solution, 'solution'], [fullUrl, full, 'full (control)']]) {
  await check(label, url, cookie, '/api/workforce/v1/runtime/tenant-scope', { status: 200 });
  await check(label, url, cookie, '/api/workforce/permits', { method: 'POST', status: 503, has: ['CAPABILITY_UNAVAILABLE'] });
  await check(label, url, cookie, '/api/unknown-module/v1/x', { status: 404, has: ['GATEWAY_UNKNOWN'] });
}
await check('solution', solutionUrl, solution, '/gigaops', { status: 200, lacks: cmmsText, has: ['href="/gigaops'] });
await check('full (control)', fullUrl, full, '/gigaops', { status: 200, has: ['href="/cmms'] });
await check('solution', solutionUrl, solution, '/modules', { status: 200, lacks: cmmsText });
await check('full (control)', fullUrl, full, '/modules', { status: 200, has: ['Asset &amp; Maintenance (CMMS)'] });

console.log(rows.join('\n'));
console.log(failed ? `${failed} check(s) failed.` : `All ${rows.length} checks passed.`);
process.exit(failed ? 1 : 0);
