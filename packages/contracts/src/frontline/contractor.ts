import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

// WI-OI-143 M-CONTR: contractor site access (Safety Operations). Pass secrets are shown once at issuance; only a hash is stored.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().min(1).max(128);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export const CONTRACTOR_INDUCTION_VALID_DAYS = 365;
export const CONTRACTOR_PASS_VALID_DAYS = 365;
export const CONTRACTOR_QUIZ_PASS_SCORE = 3;

export const ContractorQuizAnswerV1Schema = z.enum(['A', 'B', 'C']);
export type ContractorQuizAnswerV1 = z.infer<typeof ContractorQuizAnswerV1Schema>;

/** Fixed induction quiz (3 questions); answers are not security secrets — the pass secret is. */
export const CONTRACTOR_QUIZ_KEY = 'site-induction-v1' as const;
export const CONTRACTOR_QUIZ_CORRECT: Readonly<Record<'q1' | 'q2' | 'q3', ContractorQuizAnswerV1>> = Object.freeze({
  q1: 'B',
  q2: 'A',
  q3: 'C',
});

export function scoreContractorQuiz(answers: { q1: ContractorQuizAnswerV1; q2: ContractorQuizAnswerV1; q3: ContractorQuizAnswerV1 }): number {
  return (['q1', 'q2', 'q3'] as const).filter((key) => answers[key] === CONTRACTOR_QUIZ_CORRECT[key]).length;
}

export const CreateContractorCompanyV1Schema = z
  .object({
    code: TextSchema(32).regex(/^[A-Z0-9-]{2,32}$/),
    name: TextSchema(200),
    coiExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CreateContractorCompanyV1 = z.infer<typeof CreateContractorCompanyV1Schema>;

export const UpdateContractorCompanyV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    coiExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .strict();

export const ContractorCompanyV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    name: z.string(),
    coiExpiresOn: z.string(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    version: z.number().int().positive(),
  })
  .strict();
export type ContractorCompanyV1 = z.infer<typeof ContractorCompanyV1Schema>;

export const CreateContractorWorkerV1Schema = z
  .object({
    displayName: TextSchema(200),
    platformUserId: PrincipalRefSchema.optional(),
  })
  .strict();

export const EnrollContractorWorkerV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    companyCode: TextSchema(32).regex(/^[A-Z0-9-]{2,32}$/),
    displayName: TextSchema(200),
  })
  .strict();
export type EnrollContractorWorkerV1 = z.infer<typeof EnrollContractorWorkerV1Schema>;

export const ContractorWorkerV1Schema = z
  .object({
    id: UuidSchema,
    companyId: UuidSchema,
    companyName: z.string(),
    displayName: z.string(),
    platformUserId: PrincipalRefSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type ContractorWorkerV1 = z.infer<typeof ContractorWorkerV1Schema>;

export const CompleteContractorInductionV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    workerId: UuidSchema,
    quizKey: z.literal(CONTRACTOR_QUIZ_KEY),
    answers: z.object({
      q1: ContractorQuizAnswerV1Schema,
      q2: ContractorQuizAnswerV1Schema,
      q3: ContractorQuizAnswerV1Schema,
    }),
  })
  .strict();
export type CompleteContractorInductionV1 = z.infer<typeof CompleteContractorInductionV1Schema>;

export const ContractorPassV1Schema = z
  .object({
    passId: UuidSchema,
    workerId: UuidSchema,
    displayName: z.string(),
    companyName: z.string(),
    issuedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
    revoked: z.boolean(),
  })
  .strict();
export type ContractorPassV1 = z.infer<typeof ContractorPassV1Schema>;

/** Returned once when induction passes; the client builds the gate QR from passId + passSecret. */
export const ContractorPassIssuanceV1Schema = z
  .object({
    replayed: z.boolean(),
    pass: ContractorPassV1Schema,
    passSecret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ContractorPassIssuanceV1 = z.infer<typeof ContractorPassIssuanceV1Schema>;

export function hashContractorPassSecret(passSecret: string): string {
  if (!/^[a-f0-9]{64}$/.test(passSecret)) throw new Error('passSecret must be 64 lowercase hex characters.');
  return sha256Hex(passSecret);
}

export function generateContractorPassSecret(): string {
  return randomBytes(32).toString('hex');
}

export const VerifyContractorPassV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    passId: UuidSchema,
    passSecret: z.string().regex(/^[a-f0-9]{64}$/),
    siteRef: UuidSchema.optional(),
  })
  .strict();
export type VerifyContractorPassV1 = z.infer<typeof VerifyContractorPassV1Schema>;

export const ContractorVisitV1Schema = z
  .object({
    id: UuidSchema,
    workerId: UuidSchema,
    workerName: z.string(),
    companyName: z.string(),
    passId: UuidSchema,
    siteRef: UuidSchema.nullable(),
    checkedInAt: DateTimeSchema,
    checkedInBy: PrincipalRefSchema,
    checkedOutAt: DateTimeSchema.nullable(),
    escorts: z.array(z.object({ area: z.string(), authorizedBy: PrincipalRefSchema, authorizedAt: DateTimeSchema }).strict()),
  })
  .strict();
export type ContractorVisitV1 = z.infer<typeof ContractorVisitV1Schema>;

export const VerifyContractorPassResultV1Schema = z
  .object({
    replayed: z.boolean(),
    allowed: z.boolean(),
    reasonCode: z.string().nullable(),
    visit: ContractorVisitV1Schema.nullable(),
  })
  .strict();
export type VerifyContractorPassResultV1 = z.infer<typeof VerifyContractorPassResultV1Schema>;

export const CheckoutContractorVisitV1Schema = z.object({ clientOperationId: UuidSchema }).strict();

export const AuthorizeContractorEscortV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    area: TextSchema(200),
  })
  .strict();

export const ContractorRosterV1Schema = z
  .object({
    asOf: DateTimeSchema,
    onSiteCount: z.number().int().min(0),
    visits: z.array(ContractorVisitV1Schema),
  })
  .strict();
export type ContractorRosterV1 = z.infer<typeof ContractorRosterV1Schema>;
