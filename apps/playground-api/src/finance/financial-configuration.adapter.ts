import {
  ModuleAdapterDescriptorV1Schema,
  type ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import type { ModuleConfigurationAdapterV1 } from '../tenant-profile-configuration.adapter.js';

const FINANCE_DESCRIPTOR = ModuleAdapterDescriptorV1Schema.parse({
  contractVersion: '1.0',
  adapterKey: 'financial-operations-v1',
  moduleKey: 'financial-operations',
  entityKey: 'gl-journals',
  surfaceKey: 'financial-operations',
  entitlementModuleKey: 'financial-operations',
  capabilities: [
    'SURFACE_DISCOVERY',
    'RUNTIME_MANIFEST',
    'EXTENSION_VALUE_READ',
    'EXTENSION_VALUE_WRITE',
    'ADMINISTRATIVE_PREVIEW',
  ],
  storageStrategy: 'CONTROL_PLANE_EXTENSION_VALUES',
  compatibility: {
    descriptorVersion: '1.0',
    manifestContractVersion: '1.0',
    minimumRuntimeVersion: '1.0',
  },
  limits: {
    maximumFields: 100,
    maximumExtensionSlots: 2,
    maximumFilterDepth: 5,
    maximumFilterPredicates: 20,
  },
  permissions: {
    discover: 'finance:read',
    runtimeRead: 'finance:read',
    extensionRead: 'finance:read',
    extensionWrite: 'finance:manage',
    administrativePreview: ['configuration-runtime:read', 'finance:read'],
  },
  audit: {
    extensionMutationAudited: true,
    previewEventType: 'configuration.runtime.previewed.v1',
  },
  filterContract: {
    enabled: true,
    operators: ['EQUALS', 'IN', 'CONTAINS'],
    maximumDepth: 3,
    maximumPredicates: 10,
  },
  surface: {
    registrationKey: 'financial-operations-surface',
    moduleKey: 'financial-operations',
    entityKey: 'gl-journals',
    surfaceKey: 'financial-operations',
    route: '/finance',
    label: 'Financial Operations & General Ledger',
    description: 'Multi-book accounting schemas, hierarchical chart of accounts, fiscal periods, immutable general ledger journals, and real-time financial statements.',
    ownership: 'MODULE_EXTENSION',
    authoringEnabled: true,
    entityKeyEditable: false,
    surfaceKeyEditable: false,
    modes: ['LIST', 'READ', 'CREATE', 'EDIT'],
    coreFields: [
      {
        key: 'journal-number',
        label: 'Journal Number',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Unique tenant-scoped General Ledger journal voucher number.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'accounting-book-id',
        label: 'Accounting Book',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Legal-entity accounting book reference in gigalibs_finance.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'fiscal-period-id',
        label: 'Fiscal Period',
        type: 'TEXT',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Fiscal period bounds controlling ledger lockout.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'posting-date',
        label: 'Posting Date',
        type: 'DATE',
        required: true,
        readOnly: false,
        classification: 'INTERNAL',
        lockReason: 'Accounting effective transaction date.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'entry-type',
        label: 'Entry Type',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Classification of journal source (MANUAL, AP, AR, INVENTORY, REVERSAL).',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'status',
        label: 'Journal Status',
        type: 'SELECT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Ledger immutability state machine (DRAFT, POSTED, REVERSED).',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'total-debit-minor',
        label: 'Total Debits',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Balanced double-entry base currency debits minor units.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
      {
        key: 'total-credit-minor',
        label: 'Total Credits',
        type: 'TEXT',
        required: true,
        readOnly: true,
        classification: 'INTERNAL',
        lockReason: 'Balanced double-entry base currency credits minor units.',
        allowedPresentationOverrides: ['LABEL', 'HELP_TEXT', 'PLACEMENT'],
      },
    ],
    extensionSlots: [
      {
        key: 'journal-header-custom-fields',
        label: 'Journal Header Custom Attributes',
        description: 'Tenant custom dimensions attached to GL journal headers (cost center, division, project, tax jurisdiction).',
        allowedFieldTypes: [
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'INTEGER',
          'BOOLEAN',
          'DATE',
          'SELECT',
          'MULTI_SELECT',
        ],
        maximumFields: 50,
      },
      {
        key: 'journal-line-custom-fields',
        label: 'Journal Line Analytical Dimensions',
        description: 'Line-level accounting dimensions for departmental reporting and cost accounting.',
        allowedFieldTypes: [
          'TEXT',
          'TEXTAREA',
          'NUMBER',
          'INTEGER',
          'BOOLEAN',
          'DATE',
          'SELECT',
          'MULTI_SELECT',
        ],
        maximumFields: 50,
      },
    ],
  },
});

export class FinancialConfigurationAdapterV1 implements ModuleConfigurationAdapterV1 {
  readonly descriptor: ModuleAdapterDescriptorV1 = FINANCE_DESCRIPTOR;

  async generateManifest(input: {
    tenantId: string;
    version: number;
    checksum: string;
    fields?: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      slotKey: string;
    }>;
  }) {
    return {
      manifestVersion: 1,
      packageKey: 'pkg-financial-operations',
      checksum: input.checksum,
      compiledAt: new Date().toISOString(),
      entities: [
        {
          entityKey: 'gl-journals',
          moduleKey: 'financial-operations',
          label: 'General Ledger Journals',
          description: 'Double-entry balanced accounting journal vouchers.',
          fields: [
            ...this.descriptor.surface.coreFields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              readOnly: field.readOnly,
              isCore: true,
              slotKey: 'core',
            })),
            ...(input.fields ?? []).map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              readOnly: false,
              isCore: false,
              slotKey: field.slotKey,
            })),
          ],
          rules: [
            {
              ruleKey: 'rule-balanced-journal',
              name: 'Enforce Balanced Debits and Credits',
              description: 'Validates that journal debits match credits prior to posting.',
              trigger: 'ON_SUBMIT',
              expression: 'total-debit-minor == total-credit-minor',
              action: 'ALLOW',
              errorMessage: 'Journal voucher must have equal debits and credits.',
            },
          ],
        },
      ],
    };
  }

  ownsExtensionOwner(ownerType: string): boolean {
    const normalized = ownerType.trim().toLowerCase();
    return (
      normalized === 'journal' ||
      normalized === 'journals' ||
      normalized === 'gl_journal' ||
      normalized === 'gl-journal' ||
      normalized === 'gl_journal_line' ||
      normalized === 'account' ||
      normalized === 'gl_account'
    );
  }

  validatesExtensionOwner(_tenantId: string, ownerType: string, _ownerId: string): boolean {
    return this.ownsExtensionOwner(ownerType);
  }

  async readExtensionValues(_input: {
    tenantId: string;
    entityId: string;
    slotKey: string;
  }): Promise<Record<string, unknown>> {
    return {};
  }

  async writeExtensionValues(_input: {
    tenantId: string;
    entityId: string;
    slotKey: string;
    values: Record<string, unknown>;
  }): Promise<void> {
    // Stored with journal header or line dimensions
  }
}

