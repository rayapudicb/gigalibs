/**
 * WI-OI-146 (QA-009, QA-013): once Workflow Studio has not answered, the proxy gives every screen the plain answer at
 * once for a minute instead of each call waiting for its timeout (Connections never settled while it waited).
 */
export const WORKFLOW_STUDIO_NOT_RUNNING =
  'Workflows are not running on this instance yet. A platform operator starts the Workflow service.';
const UNREACHABLE_FOR_MS = 60_000;
let unreachableUntil = 0;

export function workflowStudioUnreachable(now = Date.now()): boolean {
  return now < unreachableUntil;
}

export function markWorkflowStudioUnreachable(now = Date.now()): void {
  unreachableUntil = now + UNREACHABLE_FOR_MS;
}

/** Tests start from a reachable service. */
export function resetWorkflowStudioReachability(): void {
  unreachableUntil = 0;
}
