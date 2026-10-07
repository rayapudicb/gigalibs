import { z } from 'zod';
import { permissionParts } from './permission-match.js';

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
});

// WI-OI-120q (R1): a permission code is a family and one to three parts, with colons or dots
// (`finance:journals:post`, `cmms.work-orders.read`); a third part is part of the code, never an own/team/all scope.
// Scope comes from organization and place grants (ADR-0018, ADR-0006, ADR-0034).
export const PermissionStringSchema = z
  .string()
  .refine((code) => code !== '*' && permissionParts(code) !== null, 'A permission code such as finance:journals:post');

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


export * from './permission-match.js';
export * from './permission-catalogue.generated.js';
export * from './control-plane-permissions.js';
export * from './base-roles.js';
export * from './assignment-scopes.js';
