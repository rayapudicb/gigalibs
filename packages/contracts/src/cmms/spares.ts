import { z } from 'zod';

// ─── WI-OI-136 M-BOM: exploded diagrams with part hotspots, live stock and work-order reservations (CMMS) ──
// A diagram is a governed revision per asset and diagram code; its raster image is bounded and checked by magic bytes
// (no SVG). Hotspots bind callouts to CMMS spare parts. Available stock is on hand minus open reservations.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));

export const DIAGRAM_IMAGE_MAX_BYTES = 700 * 1024;
export const DIAGRAM_MAX_HOTSPOTS = 300;
export const DiagramImageTypeV1Schema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

/** The image type its leading bytes prove, or null; the declared type must match it. */
export function sniffDiagramImage(bytes: Uint8Array): z.infer<typeof DiagramImageTypeV1Schema> | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return 'image/webp';
  return null;
}

const ImageFields = {
  imageContentType: DiagramImageTypeV1Schema,
  /** Base64 of the image, at most 700 KB decoded. */
  imageBase64: z.string().min(16).max(Math.ceil((DIAGRAM_IMAGE_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  widthPx: z.number().int().min(16).max(20_000),
  heightPx: z.number().int().min(16).max(20_000),
};

export const CreateAssetDiagramV1Schema = z
  .object({ diagramCode: CodeSchema, title: TextSchema(200), ...ImageFields })
  .strict();
export type CreateAssetDiagramV1 = z.infer<typeof CreateAssetDiagramV1Schema>;

/** A new draft revision from the published one (same image and hotspots unless replaced). */
export const ReviseAssetDiagramV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const UpdateAssetDiagramV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: TextSchema(200).optional(),
    imageContentType: ImageFields.imageContentType.optional(),
    imageBase64: ImageFields.imageBase64.optional(),
    widthPx: ImageFields.widthPx.optional(),
    heightPx: ImageFields.heightPx.optional(),
  })
  .strict()
  .refine(
    (value) => [value.imageContentType, value.imageBase64, value.widthPx, value.heightPx].every((field) => field === undefined) ||
      [value.imageContentType, value.imageBase64, value.widthPx, value.heightPx].every((field) => field !== undefined),
    { message: 'Replace the image with its type and dimensions together.' },
  );
export type UpdateAssetDiagramV1 = z.infer<typeof UpdateAssetDiagramV1Schema>;

export const DiagramHotspotInputV1Schema = z
  .object({
    callout: z.string().trim().min(1).max(16).regex(/^[A-Za-z0-9.-]+$/),
    partId: UuidSchema,
    quantity: z.number().positive().max(1_000_000),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    radius: z.number().min(0.005).max(0.5).default(0.03),
    label: z.string().trim().max(200).optional(),
  })
  .strict();

export const ReplaceDiagramHotspotsV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    hotspots: z
      .array(DiagramHotspotInputV1Schema)
      .max(DIAGRAM_MAX_HOTSPOTS)
      .refine((items) => new Set(items.map((item) => item.callout.toUpperCase())).size === items.length, {
        message: 'Each callout appears once.',
      }),
  })
  .strict();
export type ReplaceDiagramHotspotsV1 = z.infer<typeof ReplaceDiagramHotspotsV1Schema>;

export const PublishAssetDiagramV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const PartAvailabilityV1Schema = z
  .object({
    partId: UuidSchema,
    partNumber: z.string(),
    name: z.string(),
    unitOfMeasure: z.string(),
    unitCost: z.number().nullable(),
    currencyCode: z.string(),
    onHand: z.number(),
    reserved: z.number(),
    available: z.number(),
    reorderPoint: z.number().nullable(),
    stockState: z.enum(['IN_STOCK', 'LOW', 'OUT', 'NON_STOCK']),
    bins: z.array(z.object({ storeroomId: UuidSchema, storeroomName: z.string(), binLocation: z.string(), onHand: z.number() }).strict()),
    asOf: DateTimeSchema,
  })
  .strict();
export type PartAvailabilityV1 = z.infer<typeof PartAvailabilityV1Schema>;

export const AssetDiagramV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    diagramCode: z.string(),
    title: z.string(),
    revision: z.number().int().positive(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']),
    imageContentType: DiagramImageTypeV1Schema,
    imageSha256: z.string().regex(/^[0-9a-f]{64}$/),
    imageBytes: z.number().int().positive(),
    widthPx: z.number().int(),
    heightPx: z.number().int(),
    authoredBy: PrincipalRefSchema,
    publishedBy: PrincipalRefSchema.nullable(),
    publishedAt: DateTimeSchema.nullable(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type AssetDiagramV1 = z.infer<typeof AssetDiagramV1Schema>;

export const AssetDiagramDetailV1Schema = z
  .object({
    diagram: AssetDiagramV1Schema,
    hotspots: z.array(
      z
        .object({
          callout: z.string(),
          partId: UuidSchema,
          quantity: z.number(),
          x: z.number(),
          y: z.number(),
          radius: z.number(),
          label: z.string().nullable(),
          availability: PartAvailabilityV1Schema,
        })
        .strict(),
    ),
  })
  .strict();
export type AssetDiagramDetailV1 = z.infer<typeof AssetDiagramDetailV1Schema>;

export const DiagramImageV1Schema = z
  .object({ contentType: DiagramImageTypeV1Schema, base64: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
export type DiagramImageV1 = z.infer<typeof DiagramImageV1Schema>;

export const DiagramConsumptionV1Schema = z
  .object({
    diagramId: UuidSchema,
    since: DateTimeSchema,
    callouts: z.array(z.object({ callout: z.string(), partId: UuidSchema, issuedQuantity: z.number(), issueCount: z.number().int() }).strict()),
  })
  .strict();
export type DiagramConsumptionV1 = z.infer<typeof DiagramConsumptionV1Schema>;

export const ReservePartV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    partId: UuidSchema,
    workOrderId: UuidSchema,
    quantity: z.number().positive().max(1_000_000),
    diagramId: UuidSchema.optional(),
  })
  .strict();
export type ReservePartV1 = z.infer<typeof ReservePartV1Schema>;

export const ReleasePartReservationV1Schema = z.object({ reason: TextSchema(500) }).strict();

export const PartReservationV1Schema = z
  .object({
    id: UuidSchema,
    partId: UuidSchema,
    partNumber: z.string(),
    workOrderId: UuidSchema,
    woNumber: z.string(),
    quantity: z.number(),
    status: z.enum(['OPEN', 'ISSUED', 'RELEASED']),
    reservedBy: PrincipalRefSchema,
    reservedAt: DateTimeSchema,
    closedAt: DateTimeSchema.nullable(),
    closeReason: z.string().nullable(),
  })
  .strict();
export type PartReservationV1 = z.infer<typeof PartReservationV1Schema>;

export const ReservePartResultV1Schema = z
  .object({ replayed: z.boolean(), reservation: PartReservationV1Schema, availability: PartAvailabilityV1Schema, lowStock: z.boolean() })
  .strict();
export type ReservePartResultV1 = z.infer<typeof ReservePartResultV1Schema>;
