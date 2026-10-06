#!/usr/bin/env node
// WI-OI-120l (U12): the general ledger's metadata windows end to end over HTTP, on an isolated PostgreSQL database.
// Installs every hosted module with the real runner, starts the real module host with a throwaway signing key, and
// drives the calls the Finance page makes, signed exactly as the web gateway signs them, as two people: a maker who
// drafts and submits journals, and a checker who approves them (the maker may not approve their own journal).
// - a book and its standard fiscal year (the set-up panel's calls);
// - accounts created and renamed with If-Match (a stale version answers 412; the code cannot change);
// - a draft with lines: an unbalanced submit is refused, a line is removed, a stale submit answers 412;
// - submit; the maker's approval is refused; the checker approves and the journal posts exactly once;
// - a journal returned to its author with a reason, resubmitted and approved;
// - a locked period: no new draft is dated in it, and a submitted draft in it cannot post;
// - a posted journal reversed with a reason;
// - the trial balance, income statement and balance sheet from posted entries only;
// - permissions and another tenant;
// - every call is on the web gateway's allow-list for its method.
// Needs PROOF_DATABASE_URL (never the UAT instance) and a built module host (`pnpm build`).
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildPlatformContext, signPlatformContextToken } from '../packages/auth-core/dist/index.js';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const root = new URL('../', import.meta.url).pathname;
const pgDirectory = readdirSync(join(root, 'node_modules/.pnpm')).find((name) => /^pg@\d/.test(name));
const { default: pg } = await import(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg/lib/index.js'));

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120l general ledger proof');
const modules = JSON.parse(readFileSync(join(root, 'infra/compose/generated/modules.json'), 'utf8'));
// The version each module's code expects is the last migration its runtime manifest lists (the generator's rule;
// `module-manifests --check` keeps the generated file in step with it).
for (const module of Object.values(modules)) {
  const listed = readFileSync(join(root, module.directory, 'db/runtime-manifest.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  module.migrationVersion = Number(/^(\d+)_/.exec(listed.at(-1))[1]);
}
// The web gateway's allow-list exactly as the web app was generated with it: every call below must pass it for its method
// (the module host alone would accept a path the gateway refuses, as the first UAT run of the set-up panel showed).
const generated = readFileSync(join(root, 'apps/workflow-platform/lib/generated/module-gateways.ts'), 'utf8');
const gatewayStart = generated.indexOf('{', generated.indexOf('generatedModuleGateways'));
let gatewayEnd = gatewayStart;
for (let index = gatewayStart, depth = 0; index < generated.length; index += 1) {
  if (generated[index] === '{') depth += 1;
  else if (generated[index] === '}' && (depth -= 1) === 0) {
    gatewayEnd = index;
    break;
  }
}
const gatewayRoutes = JSON.parse(generated.slice(gatewayStart, gatewayEnd + 1))['financial-operations'].routes.map((route) => ({ pattern: new RegExp(route.pattern), methods: route.methods }));
const routed = (method, path) => Boolean(gatewayRoutes.find((route) => route.pattern.test(path.replace(/^\//, '').split('?')[0]))?.methods[method]);
const unrouted = new Set();
const PORT = Number(process.env.U12_PROOF_PORT ?? 47951);
const BASE = `http://127.0.0.1:${PORT}`;
const FINANCE = 'financial-operations';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 200)})` : ''}`);
}

// 1. Extensions the control plane normally installs, then every hosted module with the real runner.
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
for (const extension of ['pgcrypto', 'ltree', 'btree_gist']) await admin.query(`CREATE EXTENSION IF NOT EXISTS ${extension} WITH SCHEMA public`);
const work = mkdtempSync(join(tmpdir(), 'u12-proof-'));
cpSync(join(root, 'infra/compose/docker/run-module-migrations.mjs'), join(work, 'run.mjs'));
mkdirSync(join(work, 'node_modules'));
symlinkSync(join(root, 'node_modules/.pnpm', pgDirectory, 'node_modules/pg'), join(work, 'node_modules/pg'));
const runtimePassword = randomUUID().replaceAll('-', '');
const runtimeUrl = (schema) => {
  const url = new URL(adminUrl);
  url.username = `${schema}_u12proof`;
  url.password = runtimePassword;
  return url.toString();
};
for (const [name, module] of Object.entries(modules)) {
  const run = spawnSync(process.execPath, [join(work, 'run.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: adminUrl,
      MODULE_RUNTIME_DATABASE_URL: runtimeUrl(module.schema),
      MODULE_MIGRATIONS_DIRECTORY: join(root, module.directory, 'db/migrations'),
      MODULE_SCHEMA: module.schema,
      MODULE_EXPECTED_MIGRATION_VERSION: String(module.migrationVersion),
      MODULE_APPEND_ONLY_TABLES: (module.appendOnlyTables ?? []).join(','),
      MODULE_READ_ONLY_TABLES: (module.readOnlyTables ?? []).join(','),
    },
  });
  check(`migrate ${name} to ${module.migrationVersion}`, run.status === 0, `${run.stdout}${run.stderr}`.trim().split('\n').pop());
}

// 2. The module host with a throwaway signing key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const hostEnv = { ...process.env, NODE_ENV: 'production', MODULE_HOST_API_HOST: '127.0.0.1', MODULE_HOST_API_PORT: String(PORT), MODULE_HOST_CORS_ORIGINS: 'http://127.0.0.1:5180' };
for (const module of Object.values(modules)) {
  hostEnv[`${module.prefix}_DATABASE_URL`] = runtimeUrl(module.schema);
  hostEnv[`${module.prefix}_DATABASE_POOL_SIZE`] = '2';
  hostEnv[`${module.prefix}_EXPECTED_MIGRATION_VERSION`] = String(module.migrationVersion);
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_AUDIENCE`] = module.audience;
  hostEnv[`${module.prefix}_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`] = publicKeyBase64;
  hostEnv[`${module.prefix}_API_URL`] = `${BASE}${module.basePath}`;
}
let hostLog = '';
const host = spawn(process.execPath, [join(root, 'apps/module-host/dist/main.js')], { env: hostEnv });
host.stdout.on('data', (chunk) => (hostLog += chunk));
host.stderr.on('data', (chunk) => (hostLog += chunk));
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  ready = await fetch(`${BASE}${modules[FINANCE].basePath}/v1/health/ready`).then((r) => r.ok).catch(() => false);
}
check('module host starts with Finance', ready, ready ? '' : hostLog.split('\n').slice(-5).join(' | '));

const tenantA = `u12proof-a-${randomUUID().slice(0, 8)}`;
const tenantB = `u12proof-b-${randomUUID().slice(0, 8)}`;
const MAKER = 'maker';
const CHECKER = 'checker';
function token(tenantId, user, permissions) {
  const module = modules[FINANCE];
  const subject = {
    user: { id: `${tenantId}-${user}` },
    tenant: { id: tenantId, entitlements: [{ moduleKey: module.catalogKey ?? FINANCE, status: 'ENABLED', version: '1' }] },
    roles: ['TENANT_ADMIN'],
    platformRoles: [],
    permissions,
    authVersion: 1,
    session: { id: randomUUID() },
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
    organizationScope: { mode: 'TENANT' },
  };
  return signPlatformContextToken(buildPlatformContext(subject, module.catalogKey ?? FINANCE, module.audience), privateKeyPem);
}
/** One call to Finance as a user; record creates and actions carry a fresh Idempotency-Key unless one is given. */
async function call(method, path, body, { tenantId = tenantA, user = MAKER, headers = {}, permissions = ['finance:*'] } = {}) {
  if (!routed(method, path)) unrouted.add(`${method} ${path.split('?')[0].replace(/[0-9a-f-]{36}/g, '{id}')}`);
  const writes = method === 'POST' && (path.startsWith('/v1/records/') || path.includes('/actions/'));
  const response = await fetch(`${BASE}${modules[FINANCE].basePath}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token(tenantId, user, permissions)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(writes ? { 'Idempotency-Key': randomUUID() } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}
const record = (entity, values, options) => call('POST', `/v1/records/finance.${entity}`, values, options);
const read = (entity, id, options) => call('GET', `/v1/records/finance.${entity}/${id}`, undefined, options);
const list = (entity, query = '', options) => call('GET', `/v1/records/finance.${entity}${query}`, undefined, options);
const act = (entity, id, action, parameters, options) => call('POST', `/v1/records/finance.${entity}/${id}/actions/${action}`, parameters, options);
const shown = (r) => `${r.status} ${r.text.slice(0, 160)}`;

/** A draft with balanced lines, submitted by the maker; answers the submitted draft. */
async function submittedDraft(bookId, postingDate, description, lines) {
  const draft = await record('journal-drafts', { 'accounting-book-id': bookId, 'posting-date': postingDate, description });
  for (const [accountId, debit, credit] of lines) {
    await record('journal-draft-lines', { 'draft-id': draft.json?.id, 'account-id': accountId, ...(debit ? { 'debit-amount-minor': debit } : { 'credit-amount-minor': credit }) });
  }
  const current = await read('journal-drafts', draft.json?.id);
  return act('journal-drafts', draft.json?.id, 'submit', { expectedVersion: current.json?.version });
}

try {
  // 3. A book and its standard fiscal year, as the set-up panel creates them.
  const book = await call('POST', '/v1/books', { bookCode: 'MAIN', bookName: 'Main ledger', legalEntityPartyId: randomUUID(), currencyCode: 'USD', costingMethod: 'STANDARD', isPrimary: true });
  const bookId = book.json?.id;
  const year = await call('POST', '/v1/fiscal-years/standard', { accountingBookId: bookId, year: 2026 });
  const periods = await list('periods', `?filter.accounting-book-id=${bookId}&pageSize=50`);
  check('set up: a book and a fiscal year of twelve open monthly periods', book.status === 201 && year.status === 201 && periods.json?.total === 12 && periods.json.items.every((p) => p.status === 'OPEN'),
    `${shown(book)} | ${shown(year)} | ${periods.text.slice(0, 120)}`);
  const accountsOfBook = await call('GET', `/v1/accounts?bookId=${bookId}`);
  check("set up: the panel's account check answers the book's accounts (none yet)", accountsOfBook.status === 200 && Array.isArray(accountsOfBook.json) && accountsOfBook.json.length === 0, accountsOfBook.text.slice(0, 120));
  const books = await list('books');
  check('books: the window lists the book', books.status === 200 && books.json?.total === 1 && books.json.items[0]['book-code'] === 'MAIN', books.text.slice(0, 160));

  // 4. Accounts: created through the window, renamed with If-Match; the code cannot change.
  const account = (code, name, accountClass, subtype, normal) =>
    record('accounts', { 'accounting-book-id': bookId, 'account-code': code, 'account-name': name, 'account-class': accountClass, 'account-subtype': subtype, 'normal-balance': normal });
  const cash = await account('1000', 'Cash at bank', 'ASSET', 'BANK', 'DEBIT');
  const capital = await account('3000', 'Share capital', 'EQUITY', 'EQUITY', 'CREDIT');
  const sales = await account('4000', 'Sales revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT');
  const rent = await account('6100', 'Rent', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT');
  check('accounts: cash, capital, sales and rent are created', [cash, capital, sales, rent].every((r) => r.status === 201 && r.json?.version === 1), shown(rent));
  const renamed = await call('PATCH', `/v1/records/finance.accounts/${cash.json?.id}`, { 'account-name': 'Operating bank account' }, { headers: { 'If-Match': '"1"' } });
  const stale = await call('PATCH', `/v1/records/finance.accounts/${cash.json?.id}`, { 'account-name': 'Overwrite' }, { headers: { 'If-Match': '"1"' } });
  const recoded = await call('PATCH', `/v1/records/finance.accounts/${cash.json?.id}`, { 'account-code': '1001' }, { headers: { 'If-Match': '"2"' } });
  check('accounts: renamed with the current version; a stale rename answers 412; the code cannot change (400)',
    renamed.status === 200 && renamed.json?.['account-name'] === 'Operating bank account' && stale.status === 412 && recoded.status === 400,
    `${shown(renamed)} | ${stale.status} | ${recoded.status}`);
  const pickers = await Promise.all(['finance-books', 'finance-accounts'].map((key) => call('GET', `/v1/lookups/${key}?search=`)));
  check('pickers: books and accounts answer', pickers[0].json?.length === 1 && pickers[1].json?.length === 4, pickers.map((r) => r.text.slice(0, 80)).join(' | '));

  // 5. A draft with lines: an unbalanced submit is refused, a wrong line removed, a stale submit refused.
  const draft = await record('journal-drafts', { 'accounting-book-id': bookId, 'posting-date': '2026-03-01', description: 'Opening capital' });
  const draftId = draft.json?.id;
  const debit = await record('journal-draft-lines', { 'draft-id': draftId, 'account-id': cash.json?.id, 'debit-amount-minor': '10000000' });
  const wrong = await record('journal-draft-lines', { 'draft-id': draftId, 'account-id': capital.json?.id, 'credit-amount-minor': '9000000' });
  const both = await record('journal-draft-lines', { 'draft-id': draftId, 'account-id': capital.json?.id, 'debit-amount-minor': '5', 'credit-amount-minor': '5' });
  check('drafts: created as DRAFT; a line with both a debit and a credit is refused (400)', draft.status === 201 && draft.json?.status === 'DRAFT' && debit.status === 201 && wrong.status === 201 && both.status === 400,
    `${shown(draft)} | ${debit.status} ${wrong.status} ${shown(both)}`);
  // WI-OI-120r (S1): a direct call is refused what the window would prevent, field by field, and nothing is created.
  const draftsBefore = await call('GET', 'v1/records/finance.journal-drafts?page=1&pageSize=100');
  const noDescription = await record('journal-drafts', { 'accounting-book-id': bookId, 'posting-date': '2026-03-02' });
  const draftsAfter = await call('GET', 'v1/records/finance.journal-drafts?page=1&pageSize=100');
  check('field rules: a direct call without the required description answers 422 RECORD_RULES naming the field, and creates nothing',
    noDescription.status === 422 && noDescription.json?.code === 'RECORD_RULES' && noDescription.json?.fields?.description === 'Description is required.' && draftsAfter.json?.total === draftsBefore.json?.total,
    shown(noDescription));
  const afterLines = await read('journal-drafts', draftId);
  const unbalanced = await act('journal-drafts', draftId, 'submit', { expectedVersion: afterLines.json?.version });
  check('drafts: two lines move the version on; an unbalanced submit is refused (400)', afterLines.json?.version === 3 && unbalanced.status === 400 && /balance/.test(unbalanced.text),
    `v${afterLines.json?.version} ${shown(unbalanced)}`);
  const removed = await act('journal-draft-lines', wrong.json?.id, 'remove', {});
  const credit = await record('journal-draft-lines', { 'draft-id': draftId, 'account-id': capital.json?.id, 'credit-amount-minor': '10000000' });
  const lines = await list('journal-draft-lines', `?parentId=${draftId}`);
  const ready = await read('journal-drafts', draftId);
  check('drafts: the wrong line is removed and the right one added; the draft balances', removed.status === 200 && credit.status === 201 && lines.json?.total === 2 && ready.json?.['total-debit-minor'] === ready.json?.['total-credit-minor'] && ready.json?.version === 5,
    `${shown(removed)} | ${lines.json?.total} lines | v${ready.json?.version}`);
  const staleSubmit = await act('journal-drafts', draftId, 'submit', { expectedVersion: 3 });
  const submitted = await act('journal-drafts', draftId, 'submit', { expectedVersion: 5 });
  const lateLine = await record('journal-draft-lines', { 'draft-id': draftId, 'account-id': cash.json?.id, 'debit-amount-minor': '1' });
  check('drafts: a stale submit answers 412; submit; a submitted draft takes no more lines (409)', staleSubmit.status === 412 && submitted.json?.status === 'SUBMITTED' && lateLine.status === 409,
    `${staleSubmit.status} ${shown(submitted)} ${lateLine.status}`);

  // 6. Maker-checker: the maker cannot approve; the checker approves, and the journal posts exactly once.
  const selfApproved = await act('journal-drafts', draftId, 'approve', { expectedVersion: 6, reason: 'Fine' });
  const noReason = await act('journal-drafts', draftId, 'approve', { expectedVersion: 6 }, { user: CHECKER });
  const approveKey = randomUUID();
  const approved = await act('journal-drafts', draftId, 'approve', { expectedVersion: 6, reason: 'Matches the bank statement' }, { user: CHECKER, headers: { 'Idempotency-Key': approveKey } });
  const retried = await act('journal-drafts', draftId, 'approve', { expectedVersion: 6, reason: 'Matches the bank statement' }, { user: CHECKER, headers: { 'Idempotency-Key': approveKey } });
  const again = await act('journal-drafts', draftId, 'approve', { expectedVersion: 7, reason: 'Twice' }, { user: CHECKER });
  check('approval: the maker is refused (403); a reason is required (400); the checker approves and the draft is POSTED',
    selfApproved.status === 403 && noReason.status === 400 && approved.json?.status === 'POSTED' && approved.json?.['posted-journal-id'] && approved.json?.['approved-by'] === `${tenantA}-${CHECKER}`,
    `${selfApproved.status} ${noReason.status} ${shown(approved)}`);
  const journalId = approved.json?.['posted-journal-id'];
  const journal = await read('journals', journalId);
  const journalLines = await list('journal-lines', `?parentId=${journalId}`);
  const journals = await list('journals', `?filter.accounting-book-id=${bookId}`);
  check('approval: a retry with the same key replays the answer, a second approval is refused (409), and one journal is posted',
    retried.json?.['posted-journal-id'] === journalId && again.status === 409 && journal.json?.status === 'POSTED' && journal.json?.['total-debit-minor'] === '10000000' && journalLines.json?.total === 2 && journals.json?.total === 1,
    `${retried.status} ${again.status} ${journal.json?.status} ${journalLines.json?.total} lines, ${journals.json?.total} journals`);

  // 7. Returned to its author with a reason, resubmitted, approved.
  const sale = await submittedDraft(bookId, '2026-03-10', 'Cash sale', [[cash.json?.id, '250000', null], [sales.json?.id, null, '250000']]);
  const saleId = sale.json?.id;
  const returned = await act('journal-drafts', saleId, 'return', { expectedVersion: sale.json?.version, reason: 'Attach the invoice number' }, { user: CHECKER });
  await call('PATCH', `/v1/records/finance.journal-drafts/${saleId}`, { description: 'Cash sale, invoice INV-1001' }, { headers: { 'If-Match': `"${returned.json?.version}"` } });
  const resubmitted = await act('journal-drafts', saleId, 'submit', { expectedVersion: (returned.json?.version ?? 0) + 1 });
  const saleApproved = await act('journal-drafts', saleId, 'approve', { expectedVersion: resubmitted.json?.version, reason: 'Invoice checked' }, { user: CHECKER });
  check('return: the checker returns a draft with a reason; the maker edits, resubmits, and it posts',
    returned.json?.status === 'DRAFT' && returned.json?.['returned-reason'] === 'Attach the invoice number' && resubmitted.json?.status === 'SUBMITTED' && saleApproved.json?.status === 'POSTED',
    `${shown(returned)} | ${resubmitted.json?.status} | ${shown(saleApproved)}`);

  // 8. A locked period: no draft is dated in it, and a submitted draft in it cannot post.
  const rentDraft = await submittedDraft(bookId, '2026-04-05', 'April rent', [[rent.json?.id, '120000', null], [cash.json?.id, null, '120000']]);
  const april = periods.json?.items.find((p) => p['start-date'] === '2026-04-01');
  const lockNoReason = await act('periods', april?.id, 'lock', {}, { user: CHECKER });
  const locked = await act('periods', april?.id, 'lock', { reason: 'April closed' }, { user: CHECKER });
  const reopened = await act('periods', april?.id, 'open', {}, { user: CHECKER });
  check('periods: locking needs a reason (400); April is locked and cannot be reopened (400)', lockNoReason.status === 400 && locked.json?.status === 'LOCKED' && reopened.status === 400,
    `${lockNoReason.status} ${shown(locked)} ${reopened.status}`);
  const lateDraft = await record('journal-drafts', { 'accounting-book-id': bookId, 'posting-date': '2026-04-20', description: 'Too late' });
  const lockedApproval = await act('journal-drafts', rentDraft.json?.id, 'approve', { expectedVersion: rentDraft.json?.version, reason: 'OK' }, { user: CHECKER });
  const stillSubmitted = await read('journal-drafts', rentDraft.json?.id);
  check('periods: a draft dated in a locked period is refused (400); a submitted one cannot post and stays SUBMITTED',
    lateDraft.status === 400 && lockedApproval.status === 400 && stillSubmitted.json?.status === 'SUBMITTED', `${shown(lateDraft)} | ${shown(lockedApproval)}`);

  // 9. A posted journal reversed with a reason.
  const saleJournalId = saleApproved.json?.['posted-journal-id'];
  const reverseNoReason = await act('journals', saleJournalId, 'reverse', { 'reversal-date': '2026-03-31' });
  const reversed = await act('journals', saleJournalId, 'reverse', { reason: 'Customer cancelled', 'reversal-date': '2026-03-31' });
  const afterReversal = await list('journals', `?filter.accounting-book-id=${bookId}`);
  check('reversal: needs a reason (400); the sale is REVERSED and a reversing journal is posted', reverseNoReason.status === 400 && reversed.json?.status === 'REVERSED' && afterReversal.json?.total === 3,
    `${reverseNoReason.status} ${shown(reversed)} ${afterReversal.json?.total} journals`);

  // 10. Reports from posted entries only (the April rent never posted).
  const trial = await call('GET', `/v1/reports/trial-balance?bookId=${bookId}&asOfDate=2026-12-31`);
  const cashLine = trial.json?.lines?.find((line) => line.accountCode === '1000');
  check('reports: the trial balance balances, with cash at 100,000.00 (the sale reversed, the rent not posted)',
    trial.status === 200 && trial.json?.isBalanced === true && trial.json?.totalDebitsMinor === trial.json?.totalCreditsMinor && cashLine?.endingDebitMinor === '10000000',
    `${trial.status} ${trial.json?.isBalanced} ${trial.json?.totalDebitsMinor}/${trial.json?.totalCreditsMinor} cash ${cashLine?.endingDebitMinor}`);
  const income = await call('GET', `/v1/reports/income-statement?bookId=${bookId}&fromDate=2026-01-01&toDate=2026-12-31`);
  const balance = await call('GET', `/v1/reports/balance-sheet?bookId=${bookId}&asOfDate=2026-12-31`);
  check('reports: net income is nil and the balance sheet balances (assets 100,000.00)',
    income.status === 200 && income.json?.netIncomeMinor === '0' && balance.status === 200 && balance.json?.isBalanced === true && balance.json?.assets?.totalMinor === '10000000',
    `${income.json?.netIncomeMinor} ${balance.json?.isBalanced} ${balance.json?.assets?.totalMinor}`);

  // 11. Permissions and tenants.
  const readOnly = await record('journal-drafts', { 'accounting-book-id': bookId, 'posting-date': '2026-03-02', description: 'x' }, { permissions: ['finance:read'] });
  const poster = await submittedDraft(bookId, '2026-03-20', 'Capital top-up', [[cash.json?.id, '1000', null], [capital.json?.id, null, '1000']]);
  const noApprove = await act('journal-drafts', poster.json?.id, 'approve', { expectedVersion: poster.json?.version, reason: 'x' }, { user: CHECKER, permissions: ['finance:read', 'finance:journals:post'] });
  const noReverse = await act('journals', journalId, 'reverse', { reason: 'x' }, { user: CHECKER, permissions: ['finance:read', 'finance:journals:post', 'finance:journals:approve'] });
  check('permissions: finance:read may not draft; journals:post may not approve; approve may not reverse (403)', readOnly.status === 403 && noApprove.status === 403 && noReverse.status === 403,
    `${readOnly.status} ${noApprove.status} ${noReverse.status}`);
  const otherDraft = await read('journal-drafts', draftId, { tenantId: tenantB });
  const otherJournals = await list('journals', '', { tenantId: tenantB });
  const otherPick = await call('GET', '/v1/lookups/finance-accounts?search=cash', undefined, { tenantId: tenantB });
  const otherLine = await record('journal-draft-lines', { 'draft-id': poster.json?.id, 'account-id': cash.json?.id, 'debit-amount-minor': '1' }, { tenantId: tenantB });
  check("tenants: tenant B gets 404 for tenant A's draft, no journals, no picker options, and cannot add a line to A's draft",
    otherDraft.status === 404 && otherJournals.json?.total === 0 && otherPick.json?.length === 0 && otherLine.status === 404,
    `${otherDraft.status} ${otherJournals.text.slice(0, 60)} ${otherPick.text} ${otherLine.status}`);
  check('gateway: every call the Finance page and its windows make is on the web gateway allow-list', unrouted.size === 0, [...unrouted].join(', '));
} finally {
  host.kill('SIGTERM');
  for (const module of Object.values(modules)) {
    await admin.query(`DROP SCHEMA IF EXISTS ${module.schema} CASCADE`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${module.schema}_u12proof`).catch(() => undefined);
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
