import { holdsPermission, moduleDefaultRoles } from '@gigalibs/contracts';

/**
 * WI-OI-146 (QA-012): a refusal for a module's data names the built-in roles that grant it, so the person knows what
 * to ask their administrator for instead of reading a permission code.
 */
export function refusalMessage(body: { message?: string; code?: string; permission?: string }): string | undefined {
  if (body.code !== 'ANALYTICS_SOURCE_PERMISSION' || !body.permission) return body.message;
  const list = rolesGranting(body.permission);
  if (!list) return body.message;
  return `Your roles do not include this module's data. Ask your workspace administrator for the ${list} role.`;
}

/** The built-in roles that grant `permission`, as "A, B or C" (empty when none does). */
export function rolesGranting(permission: string): string {
  const names = Object.values(moduleDefaultRoles)
    .filter((role) => holdsPermission(role.permissions, permission))
    .map((role) => role.name);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** Browser client for the workflow Analytics BFF (`/api/analytics/...`). */
export async function moduleAnalyticsBffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/analytics/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      refusalMessage(body as { message?: string; code?: string; permission?: string }) ??
      (body as { detail?: string }).detail;
    if (response.status === 403) throw new Error(detail ?? 'You do not have permission for this.');
    throw new Error(detail ?? `Request failed (${response.status}).`);
  }
  return body as T;
}
