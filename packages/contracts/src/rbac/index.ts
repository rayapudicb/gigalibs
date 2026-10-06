import { z } from 'zod';

// ─── RBAC Enums ───────────────────────────────────────────────────────────────

export const SystemRoleSchema = z.enum([
  'SUPER_ADMIN',    // Platform-level — manages all tenants
  'TENANT_ADMIN',   // Tenant-level — manages all within org
  'MANAGER',        // Department/team lead
  'MEMBER',         // Standard user
  'VIEWER',         // Read-only
  'GUEST',          // Limited access, usually external
]);

export const PermissionActionSchema = z.enum([
  'create', 'read', 'update', 'delete', 'manage', 'export', 'import',
]);

export const PermissionSchema = z.object({
  resource: z.string(),    // e.g. 'users', 'invoices', 'tickets'
  action: PermissionActionSchema,
  scope: z.enum(['own', 'team', 'all']).default('all'),
});

// Format: "resource:action" or "resource:action:scope"
// e.g. "invoices:create", "users:delete:own"
export const PermissionStringSchema = z.string().regex(
  /^[a-z-]+:[a-z]+(:own|:team|:all)?$/,
  'Format: resource:action or resource:action:scope',
);

export const RoleDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string().optional(),
  permissions: z.array(PermissionStringSchema),
  inherits: z.array(z.string()).default([]),
  isSystem: z.boolean().default(false),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type SystemRole = z.infer<typeof SystemRoleSchema>;
export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type PermissionString = z.infer<typeof PermissionStringSchema>;
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;

// Convenience builder
export const perm = (resource: string, action: PermissionAction, scope: 'own' | 'team' | 'all' = 'all'): PermissionString =>
  `${resource}:${action}:${scope}`;

export * from './permission-match.js';
export * from './permission-catalogue.generated.js';
export * from './control-plane-permissions.js';
