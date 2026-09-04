import { z } from 'zod';

export const SamOpportunitySchema = z.object({
  noticeId: z.string(),
  title: z.string(),
  solicitationNumber: z.string().optional().nullable(),
  department: z.string(),
  subTier: z.string().optional().nullable(),
  office: z.string().optional().nullable(),
  postedDate: z.string(),
  responseDeadline: z.string().optional().nullable(),
  type: z.string(),
  naicsCode: z.string().optional().nullable(),
  classificationCode: z.string().optional().nullable(),
  active: z.boolean().default(true),
  description: z.string().optional().nullable(),
  uiLink: z.string().optional().nullable(),
  typeOfSetAside: z.string().optional().nullable(),
  typeOfSetAsideDescription: z.string().optional().nullable(),
});

export type SamOpportunity = z.infer<typeof SamOpportunitySchema>;

export const SamExclusionRecordSchema = z.object({
  classificationType: z.string(),
  name: z.string(),
  uei: z.string().optional().nullable(),
  cageCode: z.string().optional().nullable(),
  exclusionType: z.string(),
  activeDate: z.string(),
  terminationDate: z.string().optional().nullable(),
  agency: z.string().optional().nullable(),
  exclusionProgram: z.string().optional().nullable(),
});

export type SamExclusionRecord = z.infer<typeof SamExclusionRecordSchema>;

export const SamGovConnectorConfigSchema = z.object({
  apiKey: z.string().min(1, 'SAM.gov API key is required'),
  naicsCodes: z.array(z.string()).default(['541512']),
  isSandbox: z.boolean().default(false),
  syncFrequencyHours: z.number().int().min(1).max(24).default(6),
  lastSyncedAt: z.string().optional().nullable(),
});

export type SamGovConnectorConfig = z.infer<typeof SamGovConnectorConfigSchema>;
