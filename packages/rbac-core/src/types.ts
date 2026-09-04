/**
 * @gigalibs/rbac-core
 *
 * Enterprise Multi-Tenant RBAC & Scoped ABAC Types (Casbin & AWS IAM Grade).
 *
 * @module
 */

export type ResourceScope = 'ALL' | 'TEAM' | 'OWN' | 'NONE';

export type FieldMaskType = 'REDACTED' | 'PARTIAL_MASK' | 'HASHED' | 'UNMASKED';

export interface FieldMaskRule {
  field: string;
  maskType: FieldMaskType;
  allowedRoles?: string[] | undefined; // Roles exempt from masking
}

export interface TemporaryAccessGrant {
  id: string;
  userId: string;
  userName: string;
  roleId: string;
  roleName: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
  isActive: boolean;
}

export interface EnterpriseRole {
  id: string;
  name: string;
  description?: string | undefined;
  color?: string | undefined;
  isSystem?: boolean | undefined;
  priority?: number | undefined;
  inherits?: string[] | undefined;
  // Module permissions mapped to 4-tier scopes (e.g. { 'invoices:read': 'ALL', 'invoices:delete': 'OWN' })
  scopes: Record<string, ResourceScope>;
  fieldMasks?: FieldMaskRule[] | undefined;
}

export interface PermissionContext {
  userId?: string | undefined;
  userSquadId?: string | undefined;
  tenantId?: string | undefined;
  resourceOwnerId?: string | undefined;
  resourceSquadId?: string | undefined;
  resourceTenantId?: string | undefined;
  attributes?: Record<string, unknown> | undefined;
}

export interface AuthorizationDecision {
  allowed: boolean;
  decision: 'ALLOW' | 'DENY';
  matchedRole?: string | undefined;
  matchedScope?: ResourceScope | undefined;
  auditTrace: string[];
  maskedFieldsApplied?: string[] | undefined;
}

export interface ModuleCrudCapabilities {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
}

export interface CustomRoleDefinition {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isSystem?: boolean;
  modules: Record<string, Partial<ModuleCrudCapabilities>>;
}

export interface UserGroupDefinition {
  id: string;
  name: string;
  description?: string;
  leadUserId?: string;
  defaultRoleId?: string;
  memberUserIds?: string[];
  color?: string;
}

export interface UserWithRoles {
  id: string;
  name: string;
  email: string;
  roleId: string;
  groupIds?: string[];
}

export interface RoleNode {
  name: string;
  permissions: string[];
  inherits?: string[] | undefined;
}

