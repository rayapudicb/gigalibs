import { z } from 'zod';

// ─── WI-OI-140 M-REQ: no-login QR maintenance requests (CMMS) ───────────────────────────────────────────
// A request link is a revocable capability for one asset: `tenant.link.secret`, of which CMMS keeps only the secret's
// SHA-256. The tenant in a token is a claim its secret must prove. A receipt carries a separate status capability.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const SecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const RasterSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const PORTAL_PHOTO_MAX_BYTES = 300 * 1024;
export const PORTAL_LIMITS = Object.freeze({ perLinkPerHour: 10, perClientPerLinkPerHour: 3, perTenantPerDay: 300 });
export const PORTAL_ISSUE_TYPES = ['STOPPED', 'NOISE', 'LEAK', 'QUALITY', 'SAFETY', 'OTHER'] as const;
export const PortalIssueTypeV1Schema = z.enum(PORTAL_ISSUE_TYPES);
export type PortalIssueTypeV1 = z.infer<typeof PortalIssueTypeV1Schema>;

const TOKEN = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/** Splits a link or status capability into its tenant claim, its id and its secret; null when it is not one. */
export function parsePortalToken(token: unknown): { tenantId: string; id: string; secret: string } | null {
  if (typeof token !== 'string' || token.length > 160) return null;
  const match = TOKEN.exec(token.trim());
  return match ? { tenantId: match[1]!, id: match[2]!, secret: match[3]! } : null;
}

export const PortalTokenV1Schema = z.string().refine((token) => parsePortalToken(token) !== null, 'Not a request link.');

// Admin (signed-in, cmms.portal.manage)
export const CreatePortalLinkV1Schema = z
  .object({ assetId: UuidSchema, label: TextSchema(80).optional(), expiresAt: DateTimeSchema.optional() })
  .strict();
export const RevokePortalLinkV1Schema = z.object({ reason: TextSchema(500) }).strict();

export const PortalLinkV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    label: z.string().nullable(),
    status: z.enum(['ACTIVE', 'REVOKED']),
    expiresAt: DateTimeSchema.nullable(),
    createdBy: PrincipalRefSchema,
    createdAt: DateTimeSchema,
    revokedBy: PrincipalRefSchema.nullable(),
    revokedAt: DateTimeSchema.nullable(),
    lastUsedAt: DateTimeSchema.nullable(),
    submissions: z.number().int().min(0),
  })
  .strict();
export type PortalLinkV1 = z.infer<typeof PortalLinkV1Schema>;

/** The new link and its capability, shown once: CMMS keeps only the secret's hash. */
export const CreatedPortalLinkV1Schema = z.object({ link: PortalLinkV1Schema, token: z.string() }).strict();
export type CreatedPortalLinkV1 = z.infer<typeof CreatedPortalLinkV1Schema>;

export const PortalSubmissionV1Schema = z
  .object({
    id: UuidSchema,
    linkId: UuidSchema,
    assetTag: z.string(),
    issueType: PortalIssueTypeV1Schema,
    requestId: UuidSchema,
    requestNumber: z.string(),
    requestStatus: z.string(),
    hasPhoto: z.boolean(),
    submittedAt: DateTimeSchema,
  })
  .strict();
export type PortalSubmissionV1 = z.infer<typeof PortalSubmissionV1Schema>;

// Portal (anonymous, through the control plane's portal principal)
export const PortalCapabilityV1Schema = z.object({ linkId: UuidSchema, secret: SecretSchema }).strict();

export const PortalContextV1Schema = z
  .object({
    assetTag: z.string(),
    assetName: z.string(),
    issueTypes: z.array(PortalIssueTypeV1Schema),
    /** Only that something was reported recently, never what or by whom. */
    recentReportMinutesAgo: z.number().int().min(0).nullable(),
  })
  .strict();
export type PortalContextV1 = z.infer<typeof PortalContextV1Schema>;

const requestFields = {
  clientOperationId: UuidSchema,
  issueType: PortalIssueTypeV1Schema,
  description: TextSchema(1000).optional(),
  requesterName: TextSchema(120).optional(),
  requesterContact: TextSchema(240).optional(),
  photoContentType: RasterSchema.optional(),
  photoBase64: z.string().min(16).max(Math.ceil((PORTAL_PHOTO_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
};
const needsWords = (input: { issueType: string; description?: string | undefined }) =>
  input.issueType !== 'OTHER' || input.description !== undefined;
const photoTyped = (input: { photoBase64?: string | undefined; photoContentType?: string | undefined }) =>
  (input.photoBase64 === undefined) === (input.photoContentType === undefined);

/** What the public page sends (with its link token). */
export const PortalSubmitV1Schema = z
  .object({ token: PortalTokenV1Schema, ...requestFields })
  .strict()
  .refine(needsWords, { message: 'Say what is wrong.' })
  .refine(photoTyped, { message: 'A photo carries its type.' });
export type PortalSubmitV1 = z.infer<typeof PortalSubmitV1Schema>;
/** What CMMS receives from the control plane: the link capability, the request, and a keyed client reference. */
export const PortalRequestV1Schema = z
  .object({ linkId: UuidSchema, secret: SecretSchema, clientKey: z.string().regex(/^[0-9a-f]{64}$/), ...requestFields })
  .strict()
  .refine(needsWords, { message: 'Say what is wrong.' })
  .refine(photoTyped, { message: 'A photo carries its type.' });

export const PortalReceiptV1Schema = z
  .object({ requestNumber: z.string(), statusToken: z.string(), replayed: z.boolean() })
  .strict();
export type PortalReceiptV1 = z.infer<typeof PortalReceiptV1Schema>;

export const PortalStatusQueryV1Schema = z.object({ token: PortalTokenV1Schema }).strict();
export const PortalStatusCapabilityV1Schema = z.object({ submissionId: UuidSchema, secret: SecretSchema }).strict();
export const PortalStatusV1Schema = z
  .object({
    requestNumber: z.string(),
    assetTag: z.string(),
    state: z.enum(['RECEIVED', 'IN_HAND', 'DONE', 'CLOSED']),
    submittedAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .strict();
export type PortalStatusV1 = z.infer<typeof PortalStatusV1Schema>;

/** The requester-facing state of a request and its work order: received, being worked, done, or closed. */
export function portalState(requestStatus: string, workOrderStatus: string | null): PortalStatusV1['state'] {
  if (requestStatus === 'REJECTED' || requestStatus === 'CANCELLED') return 'CLOSED';
  if (requestStatus !== 'ACCEPTED') return 'RECEIVED';
  if (workOrderStatus === 'COMPLETED') return 'DONE';
  if (workOrderStatus === 'CANCELLED') return 'CLOSED';
  return 'IN_HAND';
}

// Signed-in reports (mobile, cmms.requests.create): the same request card, idempotent per member and operation.
export const ReportProblemV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    assetId: UuidSchema,
    issueType: PortalIssueTypeV1Schema,
    description: TextSchema(1000).optional(),
    photoContentType: RasterSchema.optional(),
    photoBase64: requestFields.photoBase64,
  })
  .strict()
  .refine(needsWords, { message: 'Say what is wrong.' })
  .refine(photoTyped, { message: 'A photo carries its type.' });
export type ReportProblemV1 = z.infer<typeof ReportProblemV1Schema>;

export const RequestReportV1Schema = z
  .object({
    id: UuidSchema,
    requestId: UuidSchema,
    requestNumber: z.string(),
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    issueType: PortalIssueTypeV1Schema,
    state: z.enum(['RECEIVED', 'IN_HAND', 'DONE', 'CLOSED']),
    submittedAt: DateTimeSchema,
  })
  .strict();
export type RequestReportV1 = z.infer<typeof RequestReportV1Schema>;
export const ReportProblemResultV1Schema = z.object({ replayed: z.boolean(), report: RequestReportV1Schema }).strict();
export type ReportProblemResultV1 = z.infer<typeof ReportProblemResultV1Schema>;
