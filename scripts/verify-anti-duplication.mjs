import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const appRoot = join(root, 'apps/workflow-platform/app/(app)');
const componentsRoot = join(root, 'apps/workflow-platform/components');

const violations = [];
let scannedPages = 0;

/**
 * Scan for duplicate navigation bars, parallel redundant routes,
 * and competing sub-nav layers across workflow-platform pages.
 */
function scanDirectory(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry === 'page.tsx') {
      scannedPages++;
      checkPage(fullPath);
    }
  }
}

function checkPage(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const relPath = relative(root, filePath);

  // 1. Check for duplicate stacked navigation:
  // A page should not render both an external <*Nav /> sub-nav AND an internal tab bar for identical entities.
  const hasSubNav = /<[A-Z][a-zA-Z]*Nav\s*\/>/.test(content);
  const hasInternalTabs = /activeTab\s*===/.test(content) || /<Tabs\.List/.test(content);

  if (hasSubNav && hasInternalTabs) {
    // Check if the tabs duplicate sub-nav items (e.g., invoices, customers, drafts)
    const mentionsInvoices = /id:\s*['"]invoices['"]|value=['"]invoices['"]/.test(content);
    const mentionsCustomers = /id:\s*['"]clients['"]|id:\s*['"]customers['"]|value=['"]customers['"]/.test(content);
    if (mentionsInvoices || mentionsCustomers) {
      violations.push({
        code: 'DUPLICATE_STACKED_NAVIGATION',
        file: relPath,
        reason: 'Page renders both an external domain Nav component and an internal tab bar that duplicate domain entities (e.g., Invoices/Customers). Remove redundant Nav or merge into a single cohesive navigation hierarchy.',
      });
    }
  }

  // 2. Check for duplicate hardcoded mock arrays when authoritative store exists
  if (content.includes('FALLBACK_INVOICES = [') && !filePath.includes('ar-fallback-data.ts')) {
    violations.push({
      code: 'DUPLICATE_DOMAIN_DATA_DECLARATION',
      file: relPath,
      reason: 'Domain data array redeclared locally instead of importing canonical store from @/lib/ar-fallback-data or domain store.',
    });
  }
}

scanDirectory(appRoot);

if (violations.length > 0) {
  console.error(JSON.stringify({
    status: 'failed',
    scannedPages,
    violationCount: violations.length,
    violations,
  }, null, 2));
  process.exit(1);
} else {
  console.log(JSON.stringify({
    status: 'passed',
    scannedPages,
    violationCount: 0,
    enforcementStandard: 'Architectural Enhancement & Anti-Duplication Guardian (EEF-01)',
  }, null, 2));
}
