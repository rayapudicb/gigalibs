import { z } from 'zod';

// WI-OI-103b: formula measures are a closed, typed expression tree. Raw SQL and free-form expressions are not part
// of the contract, so a saved definition can be validated, reviewed and compiled without interpreting user text.

export const FormulaMeasureNameV1Schema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, 'Measure names are letters, digits and underscores (max 64).');

export type FormulaExpressionV1 =
  | { readonly kind: 'measure'; readonly name: string }
  | { readonly kind: 'constant'; readonly value: number }
  | {
      readonly kind: 'binary';
      readonly operator: 'add' | 'subtract' | 'multiply' | 'divide';
      readonly left: FormulaExpressionV1;
      readonly right: FormulaExpressionV1;
    };

export const FormulaExpressionV1Schema: z.ZodType<FormulaExpressionV1> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('measure'), name: FormulaMeasureNameV1Schema }).strict(),
    z.object({ kind: z.literal('constant'), value: z.number().finite().min(-1_000_000_000).max(1_000_000_000) }).strict(),
    z
      .object({
        kind: z.literal('binary'),
        operator: z.enum(['add', 'subtract', 'multiply', 'divide']),
        left: FormulaExpressionV1Schema,
        right: FormulaExpressionV1Schema,
      })
      .strict(),
  ]),
);

export const FormulaMeasureDefinitionV1Schema = z
  .object({
    displayLabel: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).nullable().default(null),
    /** Display unit only; it never changes query arithmetic. */
    unit: z.string().trim().min(1).max(32),
    expression: FormulaExpressionV1Schema,
  })
  .strict()
  .superRefine((definition, context) => {
    const inspection = inspectFormulaExpression(definition.expression);
    if (inspection.nodeCount > 31) {
      context.addIssue({ code: 'custom', path: ['expression'], message: 'A formula may contain at most 31 nodes.' });
    }
    if (inspection.depth > 8) {
      context.addIssue({ code: 'custom', path: ['expression'], message: 'A formula may be at most 8 levels deep.' });
    }
    if (inspection.measureNames.size === 0) {
      context.addIssue({ code: 'custom', path: ['expression'], message: 'A formula must reference at least one base measure.' });
    }
    if (inspection.measureNames.size > 10) {
      context.addIssue({ code: 'custom', path: ['expression'], message: 'A formula may reference at most 10 base measures.' });
    }
  });
export type FormulaMeasureDefinitionV1 = z.infer<typeof FormulaMeasureDefinitionV1Schema>;

export const CreateFormulaMeasureV1Schema = z
  .object({
    semanticModelId: z.string().uuid(),
    name: FormulaMeasureNameV1Schema,
    definition: FormulaMeasureDefinitionV1Schema,
  })
  .strict();
export type CreateFormulaMeasureV1 = z.infer<typeof CreateFormulaMeasureV1Schema>;

export const CreateFormulaMeasureVersionV1Schema = z.object({ definition: FormulaMeasureDefinitionV1Schema }).strict();
export type CreateFormulaMeasureVersionV1 = z.infer<typeof CreateFormulaMeasureVersionV1Schema>;

export const FormulaMeasureDecisionV1Schema = z
  .object({ reason: z.string().trim().min(1).max(500).nullable().default(null) })
  .strict();
export type FormulaMeasureDecisionV1 = z.infer<typeof FormulaMeasureDecisionV1Schema>;

export const FormulaMeasureVersionStateV1Schema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'REJECTED',
]);
export type FormulaMeasureVersionStateV1 = z.infer<typeof FormulaMeasureVersionStateV1Schema>;

export const FormulaMeasureVersionV1Schema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  definition: FormulaMeasureDefinitionV1Schema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: FormulaMeasureVersionStateV1Schema,
  createdBy: z.string(),
  createdAt: z.string(),
  submittedBy: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewReason: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});
export type FormulaMeasureVersionV1 = z.infer<typeof FormulaMeasureVersionV1Schema>;

export const FormulaMeasureV1Schema = z.object({
  id: z.string().uuid(),
  semanticModelId: z.string().uuid(),
  name: FormulaMeasureNameV1Schema,
  createdBy: z.string(),
  createdAt: z.string(),
  publishedVersionId: z.string().uuid().nullable(),
  versions: z.array(FormulaMeasureVersionV1Schema),
});
export type FormulaMeasureV1 = z.infer<typeof FormulaMeasureV1Schema>;

export function inspectFormulaExpression(expression: FormulaExpressionV1): {
  readonly nodeCount: number;
  readonly depth: number;
  readonly measureNames: ReadonlySet<string>;
} {
  const measureNames = new Set<string>();
  let nodeCount = 0;
  let depth = 0;
  const visit = (node: FormulaExpressionV1, level: number): void => {
    nodeCount += 1;
    depth = Math.max(depth, level);
    if (node.kind === 'measure') measureNames.add(node.name);
    if (node.kind === 'binary') {
      visit(node.left, level + 1);
      visit(node.right, level + 1);
    }
  };
  visit(expression, 1);
  return { nodeCount, depth, measureNames };
}
