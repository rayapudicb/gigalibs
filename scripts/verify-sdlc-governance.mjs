import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const configPath = join(root, 'config/sdlc-governance.json');
const violations = [];

if (!existsSync(configPath)) {
  throw new Error('config/sdlc-governance.json is required');
}

const governance = JSON.parse(readFileSync(configPath, 'utf8'));
if (governance.schemaVersion !== 1)
  violation('SDL_SCHEMA', 'Unsupported governance schema version.');

const agents = [governance.coordinator, ...(governance.importedAgents ?? [])];
if (new Set(agents).size !== agents.length)
  violation('AGENT_DUPLICATE', 'Agent IDs must be unique.');
if ((governance.importedAgents ?? []).length !== 18) {
  violation(
    'IMPORT_INCOMPLETE',
    `Expected 18 imported TextFly roles; found ${(governance.importedAgents ?? []).length}.`,
  );
}
for (const id of agents) {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) violation('AGENT_ID', `Invalid agent ID: ${String(id)}`);
  required(`.pi/agents/${id}/AGENT.md`, 'AGENT_DEFINITION');
}
for (const artifact of governance.mandatoryArtifacts ?? []) required(artifact, 'ARTIFACT_MISSING');

const estimate = governance.relativeDeliveryEstimate ?? {};
if (
  !Number.isFinite(estimate.total) ||
  !Number.isFinite(estimate.earned) ||
  !Number.isFinite(estimate.remaining) ||
  estimate.total <= 0 ||
  estimate.earned < 0 ||
  estimate.remaining < 0 ||
  estimate.earned + estimate.remaining !== estimate.total
) {
  violation(
    'ESTIMATE_INVALID',
    'Delivery estimate must have non-negative earned/remaining values summing to total.',
  );
}
if (governance.workInProgressLimits?.implementationModules !== 1) {
  violation('WIP_LIMIT', 'Exactly one implementation module must be allowed in progress.');
}

const requirements = read('docs/REQUIREMENTS_BASELINE.md');
const requiredFr = Array.from(
  { length: 16 },
  (_, index) => `FR-${String(index + 1).padStart(2, '0')}`,
);
for (const id of requiredFr) {
  if (!requirements.includes(`| ${id} |`))
    violation('REQUIREMENT_MISSING', `${id} is absent from the baseline.`);
}

const workItems = read('.pi/WORK_ITEMS.md');
const rows = workItems.split('\n').filter((line) => /^\| WI-OI-\d{3} \|/.test(line));
const workIds = rows.map((line) => line.split('|')[1].trim());
if (new Set(workIds).size !== workIds.length)
  violation('WORK_ITEM_DUPLICATE', 'Work-item IDs must be unique.');
const workStatusById = new Map();
for (const row of rows) {
  const cells = row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  const [id, requirementCell, status, owner, reviewers, gate, evidence] = cells;
  workStatusById.set(id, status);
  if (!(governance.statusValues ?? []).includes(status))
    violation('WORK_STATUS', `${id} has invalid status ${status}.`);
  if (!/(?:FR-\d{2}|NFR-[A-Z]+-\d{3})/.test(requirementCell)) {
    violation('WORK_REQUIREMENT', `${id} has no requirement linkage.`);
  }
  if (!owner || !reviewers || !gate || !evidence)
    violation('WORK_HANDOFF', `${id} has incomplete handoff metadata.`);
  if (['Accepted', 'Released'].includes(status) && !/human/i.test(evidence)) {
    violation('HUMAN_AUTHORITY', `${id} cannot be ${status} without recorded human authority.`);
  }
}
if (rows.length === 0) violation('WORK_ITEMS_EMPTY', 'No canonical work items were found.');

const activeImplementationWorkItems =
  governance.workInProgressLimits?.activeImplementationWorkItems ?? [];
if (new Set(activeImplementationWorkItems).size !== activeImplementationWorkItems.length) {
  violation('WIP_DUPLICATE', 'Active implementation work-item IDs must be unique.');
}
if (activeImplementationWorkItems.length > governance.workInProgressLimits?.implementationModules) {
  violation('WIP_EXCEEDED', 'Active implementation work exceeds the configured module limit.');
}
for (const id of activeImplementationWorkItems) {
  if (!workStatusById.has(id))
    violation('WIP_UNKNOWN', `${id} is not in the canonical work register.`);
  if (workStatusById.get(id) !== 'In Progress') {
    violation('WIP_STATUS', `${id} must be In Progress while listed as active implementation.`);
  }
}

const totalEstimateRow = workItems.split('\n').find((line) => line.startsWith('| **Total** |'));
if (!totalEstimateRow) {
  violation('ESTIMATE_MISSING', 'The canonical work register must contain a total estimate row.');
} else {
  const cells = totalEstimateRow
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.replaceAll('*', '').trim());
  const [, total, earned, remaining] = cells;
  if (
    Number(total) !== estimate.total ||
    Number(earned) !== estimate.earned ||
    Number(remaining) !== estimate.remaining
  ) {
    violation('ESTIMATE_DRIFT', 'Governance config and work-register estimates must match.');
  }
}

for (const id of requiredFr) {
  if (!workItems.includes(id) && !workItems.includes('FR-01–FR-16')) {
    violation('WORK_COVERAGE', `${id} is not represented in the work register.`);
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'failed', violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      agents: agents.length,
      importedTextFlyAgents: governance.importedAgents.length,
      workItems: rows.length,
      functionalRequirements: requiredFr.length,
      workInProgressLimit: governance.workInProgressLimits.implementationModules,
      activeImplementationWorkItems,
      deliveryEstimate: governance.relativeDeliveryEstimate,
    },
    null,
    2,
  ),
);

function required(relativePath, code) {
  if (!existsSync(join(root, relativePath))) violation(code, `${relativePath} is required.`);
}

function read(relativePath) {
  const normalized = relativePath.replace(/^\.\//, '');
  const path = join(root, normalized);
  if (!existsSync(path)) {
    violation('READ_MISSING', `${normalized} is required.`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function violation(code, message) {
  violations.push({ code, message });
}
