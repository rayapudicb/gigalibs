import type { OrgHierarchyVersionV1 } from '@gigalibs/contracts';
import { hasPermission } from '@/lib/module-access';

// WI-OI-109d: the organization screens' requests and rules, kept free of React so they can be tested directly.
// Requests go through the authenticated control-plane proxy; the server decides every permission and rule, and the
// screen only hides what the member cannot do and explains what the server refused.

export const ORG_BASE = '/api/control/tenants/current/organization';

export interface OrgProblem {
  code: string;
  unitId: string;
  detail: string;
}

export class OrgRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems: OrgProblem[] = [],
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

export async function orgRequest<T>(path: string, init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ORG_BASE}${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      ...(init.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new OrgRequestError('The organization service could not be reached.', 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nested = body.message && typeof body.message === 'object' ? (body.message as Record<string, unknown>) : body;
    const message = typeof nested.message === 'string' ? nested.message : typeof body.detail === 'string' ? body.detail : '';
    const problems = Array.isArray(nested.problems) ? (nested.problems as OrgProblem[]) : [];
    const issues = Array.isArray(nested.issues)
      ? (nested.issues as Array<{ path?: unknown[]; message?: string }>).map((issue) =>
          [Array.isArray(issue.path) ? issue.path.join('.') : '', issue.message ?? ''].filter(Boolean).join(': '),
        )
      : [];
    throw new OrgRequestError(message, response.status, problems, issues);
  }
  return payload as T;
}

export type OrgErrorKind = 'session' | 'denied' | 'missing' | 'conflict' | 'invalid' | 'unavailable';

export interface OrgErrorView {
  kind: OrgErrorKind;
  title: string;
  message: string;
  problems: OrgProblem[];
  issues: string[];
  /** Conflicts are fixed by reloading; outages by retrying the same step. */
  action: 'reload' | 'retry' | 'sign-in' | null;
}

/** Turns a refusal into words for the screen, keeping the server's own explanation when it gave one. */
export function describeOrgError(error: unknown): OrgErrorView {
  const status = error instanceof OrgRequestError ? error.status : 0;
  const server = error instanceof OrgRequestError ? error.message : '';
  const problems = error instanceof OrgRequestError ? error.problems : [];
  const issues = error instanceof OrgRequestError ? error.issues : [];
  const view = (kind: OrgErrorKind, title: string, fallback: string, action: OrgErrorView['action']): OrgErrorView => ({
    kind,
    title,
    message: server && !/^(Internal server error|Request validation failed\.)$/.test(server) ? server : fallback,
    problems,
    issues,
    action,
  });
  if (status === 401) return view('session', 'Your session ended', 'Sign in again to continue.', 'sign-in');
  if (status === 403) return view('denied', 'Not allowed', 'You do not have permission for this step.', null);
  if (status === 404) return view('missing', 'Not found', 'It no longer exists in this organization; reload to see the current state.', 'reload');
  if (status === 409) return view('conflict', 'Changed elsewhere', 'Someone changed this since you loaded it. Reload and try again.', 'reload');
  if (status === 400 || status === 422) return view('invalid', 'Check the details', 'The change breaks an organization rule.', null);
  return view('unavailable', 'Organization service unavailable', 'The organization service is unavailable. Try again shortly.', 'retry');
}

export interface OrgPermissions {
  read: boolean;
  draft: boolean;
  approve: boolean;
  activate: boolean;
  grant: boolean;
}

export function orgPermissions(granted: readonly string[]): OrgPermissions {
  return {
    read: hasPermission(granted, 'organization:read'),
    draft: hasPermission(granted, 'organization:draft'),
    approve: hasPermission(granted, 'organization:approve'),
    activate: hasPermission(granted, 'organization:activate'),
    grant: hasPermission(granted, 'organization:grant'),
  };
}

export type OrgWorkflowAction = 'edit' | 'validate' | 'submit' | 'withdraw' | 'approve' | 'reject' | 'publish' | 'activate';

export interface OrgWorkflowStep {
  action: OrgWorkflowAction;
  allowed: boolean;
  /** Why a visible step is unavailable to this person. */
  reason: string | null;
}

/** The steps a person may take on a version, mirroring the server's lifecycle and maker-checker rules. */
export function workflowSteps(version: Pick<OrgHierarchyVersionV1, 'status' | 'createdBy' | 'submittedBy'>, permissions: OrgPermissions, userId: string): OrgWorkflowStep[] {
  const step = (action: OrgWorkflowAction, permitted: boolean, missing: string, reason: string | null = null): OrgWorkflowStep => ({
    action,
    allowed: permitted && reason === null,
    reason: permitted ? reason : missing,
  });
  const ownWork = version.createdBy === userId || version.submittedBy === userId;
  switch (version.status) {
    case 'DRAFT':
      return [
        step('edit', permissions.draft, 'Needs organization:draft.'),
        step('validate', permissions.draft, 'Needs organization:draft.'),
        step('withdraw', permissions.draft, 'Needs organization:draft.'),
      ];
    case 'VALIDATED':
      return [
        step('edit', permissions.draft, 'Needs organization:draft.'),
        step('submit', permissions.draft, 'Needs organization:draft.'),
        step('withdraw', permissions.draft, 'Needs organization:draft.'),
      ];
    case 'SUBMITTED':
      return [
        step('approve', permissions.approve, 'Needs organization:approve.', ownWork ? 'A second person approves; you wrote or submitted this version.' : null),
        step('reject', permissions.approve, 'Needs organization:approve.'),
      ];
    case 'APPROVED':
      return [step('publish', permissions.activate, 'Needs organization:activate.'), step('reject', permissions.approve, 'Needs organization:approve.')];
    case 'PUBLISHED':
      return [step('activate', permissions.activate, 'Needs organization:activate.')];
    default:
      return [];
  }
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

/** `datetime-local` input value (local time) → ISO instant; empty means now. */
export function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export const VERSION_STATUS_COLOR: Record<string, 'green' | 'orange' | 'blue' | 'grey' | 'red' | 'purple'> = {
  DRAFT: 'grey',
  VALIDATED: 'blue',
  SUBMITTED: 'orange',
  APPROVED: 'purple',
  PUBLISHED: 'green',
  REJECTED: 'red',
};
