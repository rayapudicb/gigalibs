import { TenantMemberRoleSchema } from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const text = z.string().trim().min(1).max(256);
const schemas = z.array(text).min(1).max(4).optional();
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const roles = z.array(z.object({ value: TenantMemberRoleSchema, primary: z.boolean().optional() }).strict()).length(1);

export const ScimUserCreateSchema = z.object({
  schemas,
  externalId: text.optional(),
  userName: email,
  name: z.object({ formatted: text.optional(), familyName: text.optional(), givenName: text.optional() }).strict().optional(),
  displayName: text.optional(),
  emails: z.array(z.object({ value: email, type: text.optional(), primary: z.boolean().optional() }).strict()).min(1).max(10).optional(),
  active: z.boolean().optional(),
  roles: roles.optional(),
}).strict().superRefine((input, ctx) => {
  if (input.emails && input.emails[0]?.value !== input.userName) {
    ctx.addIssue({ code: 'custom', message: 'The primary provisioning email must match userName.', path: ['emails'] });
  }
});

const changes = z.object({ active: z.boolean().optional(), roles: roles.optional() }).strict()
  .refine((value) => value.active !== undefined || value.roles !== undefined, 'An active or roles change is required.');
export const ScimPatchSchema = z.object({
  schemas,
  Operations: z.array(z.object({
    op: z.string().transform((value) => value.toLowerCase()).pipe(z.enum(['add', 'replace'])),
    path: z.enum(['active', 'roles']).optional(),
    value: z.unknown(),
  }).strict().superRefine((operation, ctx) => {
    const schema = operation.path === 'active' ? z.boolean() : operation.path === 'roles' ? roles : changes;
    if (!schema.safeParse(operation.value).success) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Expected a boolean active state or one supported tenant role; unsupported attributes are refused.' });
    }
  })).min(1).max(20),
}).strict();

export type ScimUserCreateInput = z.infer<typeof ScimUserCreateSchema>;
export type ScimPatchInput = z.infer<typeof ScimPatchSchema>;

export function parseScim<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({
    code: 'SCIM_INVALID_INPUT', message: 'Invalid or unsupported SCIM input.',
    errors: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
  return result.data;
}

export function scimMembershipChanges(input: ScimPatchInput) {
  const result: { active?: boolean; role?: z.infer<typeof TenantMemberRoleSchema> } = {};
  for (const operation of input.Operations) {
    const value = changes.parse(operation.path ? { [operation.path]: operation.value } : operation.value);
    if (value.active !== undefined) result.active = value.active;
    if (value.roles?.[0]) result.role = value.roles[0].value;
  }
  return result;
}

export function scimPageNumber(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
    throw new BadRequestException('SCIM pagination is outside the supported range.');
  }
  return Number(value);
}
