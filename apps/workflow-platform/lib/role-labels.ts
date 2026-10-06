// WI-OI-120n: words, not codes. Workspace roles and member statuses as people read them; codes stay in the data.

const ROLE_LABELS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'Super administrator',
  TENANT_ADMIN: 'Workspace administrator',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
  GUEST: 'Guest',
  PLATFORM_OWNER: 'Platform owner',
  PLATFORM_ADMIN: 'Platform administrator',
  PLATFORM_OPERATOR: 'Platform operator',
  PLATFORM_AUDITOR: 'Platform auditor',
  PLATFORM_SUPPORT: 'Platform support',
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  INVITED: 'Invited',
  INACTIVE: 'Inactive',
};

/** A role code as a person reads it; an unknown code (a custom role's name) is shown as it is. */
export function roleLabel(code: string): string {
  return ROLE_LABELS[code.toUpperCase()] ?? code;
}

export function memberStatusLabel(code: string): string {
  return STATUS_LABELS[code.toUpperCase()] ?? code;
}
