/**
 * Master Data CSV/Excel Template Specifications & Two-Phase Ingestion Validator
 */

export interface MasterTemplateColumn {
  key: string;
  header: string;
  required: boolean;
  type: 'string' | 'number' | 'email' | 'currency' | 'enum';
  enumValues?: string[];
  description: string;
  sample: string;
}

export interface MasterTemplateSpec {
  entityKey: string;
  title: string;
  domain: 'COUNTERPARTY' | 'FINANCE' | 'ASSETS' | 'GOVERNANCE' | 'REFERENCE';
  columns: MasterTemplateColumn[];
  sampleRows: Record<string, any>[];
}

export const MASTER_DATA_TEMPLATE_SPECS: Record<string, MasterTemplateSpec> = {
  customers: {
    entityKey: 'customers',
    title: 'Customer Directory Master',
    domain: 'COUNTERPARTY',
    columns: [
      { key: 'code', header: 'Customer_Code', required: true, type: 'string', description: 'Unique customer reference ID (e.g. CUST-1001)', sample: 'CUST-1001' },
      { key: 'name', header: 'Company_Name', required: true, type: 'string', description: 'Legal corporate company name', sample: 'Apex Global Logistics Inc' },
      { key: 'billingEmail', header: 'Billing_Email', required: true, type: 'email', description: 'Primary invoicing contact email address', sample: 'billing@apexlogistics.com' },
      { key: 'taxId', header: 'Tax_ID', required: false, type: 'string', description: 'EIN / VAT / GSTIN registration number', sample: 'US987654321' },
      { key: 'currency', header: 'Currency', required: true, type: 'currency', description: 'ISO 4217 3-letter currency code', sample: 'USD' },
      { key: 'paymentTerms', header: 'Payment_Terms', required: false, type: 'string', description: 'Standard terms code (e.g. NET_30)', sample: 'NET_30' },
      { key: 'creditLimitUsd', header: 'Credit_Limit_USD', required: false, type: 'number', description: 'Approved credit limit ceiling', sample: '100000' },
      { key: 'status', header: 'Status', required: false, type: 'enum', enumValues: ['ACTIVE', 'INACTIVE'], description: 'Record status', sample: 'ACTIVE' },
    ],
    sampleRows: [
      {
        Customer_Code: 'CUST-1001',
        Company_Name: 'Apex Global Logistics Inc',
        Billing_Email: 'billing@apexlogistics.com',
        Tax_ID: 'US987654321',
        Currency: 'USD',
        Payment_Terms: 'NET_30',
        Credit_Limit_USD: '100000',
        Status: 'ACTIVE',
      },
      {
        Customer_Code: 'CUST-1002',
        Company_Name: 'Bavaria Industrial Automation AG',
        Billing_Email: 'invoices@bavaria-ind.de',
        Tax_ID: 'DE123456789',
        Currency: 'EUR',
        Payment_Terms: 'NET_45',
        Credit_Limit_USD: '250000',
        Status: 'ACTIVE',
      },
    ],
  },
  vendors: {
    entityKey: 'vendors',
    title: 'Supplier & Vendor Master',
    domain: 'COUNTERPARTY',
    columns: [
      { key: 'code', header: 'Vendor_Code', required: true, type: 'string', description: 'Unique vendor identifier (e.g. VEND-5001)', sample: 'VEND-5001' },
      { key: 'name', header: 'Vendor_Name', required: true, type: 'string', description: 'Legal supplier entity name', sample: 'Continental Precision Parts Ltd' },
      { key: 'remitEmail', header: 'Remit_Email', required: true, type: 'email', description: 'Remittance confirmation email', sample: 'ap@continentalparts.com' },
      { key: 'taxId', header: 'Tax_ID', required: false, type: 'string', description: 'Supplier tax identifier (W-9 / 1099 / VAT)', sample: 'US112233445' },
      { key: 'bankIbanOrAccount', header: 'Bank_Account_IBAN', required: false, type: 'string', description: 'Remittance bank account or IBAN', sample: 'US1234567890123456' },
      { key: 'bankSwiftOrRouting', header: 'Routing_SWIFT', required: false, type: 'string', description: 'Bank routing transit or SWIFT BIC', sample: 'CHASUS33' },
      { key: 'currency', header: 'Currency', required: true, type: 'currency', description: 'ISO 4217 settlement currency', sample: 'USD' },
      { key: 'paymentTerms', header: 'Payment_Terms', required: false, type: 'string', description: 'Agreed AP payment terms', sample: 'NET_30' },
      { key: 'status', header: 'Status', required: false, type: 'enum', enumValues: ['ACTIVE', 'INACTIVE'], description: 'Supplier status', sample: 'ACTIVE' },
    ],
    sampleRows: [
      {
        Vendor_Code: 'VEND-5001',
        Vendor_Name: 'Continental Precision Parts Ltd',
        Remit_Email: 'ap@continentalparts.com',
        Tax_ID: 'US112233445',
        Bank_Account_IBAN: 'US1234567890123456',
        Routing_SWIFT: 'CHASUS33',
        Currency: 'USD',
        Payment_Terms: 'NET_30',
        Status: 'ACTIVE',
      },
    ],
  },
  accounts: {
    entityKey: 'accounts',
    title: 'General Ledger Chart of Accounts',
    domain: 'FINANCE',
    columns: [
      { key: 'code', header: 'Account_Code', required: true, type: 'string', description: 'GL account number (e.g. 1010, 4010)', sample: '1010' },
      { key: 'name', header: 'Account_Title', required: true, type: 'string', description: 'Financial title of the account', sample: 'Operating Cash Account' },
      { key: 'class', header: 'Account_Class', required: true, type: 'enum', enumValues: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], description: 'GAAP / IFRS financial class', sample: 'ASSET' },
      { key: 'normalBalance', header: 'Normal_Balance', required: true, type: 'enum', enumValues: ['DEBIT', 'CREDIT'], description: 'Default balance side', sample: 'DEBIT' },
      { key: 'status', header: 'Status', required: false, type: 'enum', enumValues: ['ACTIVE', 'INACTIVE'], description: 'Account status', sample: 'ACTIVE' },
    ],
    sampleRows: [
      {
        Account_Code: '1010',
        Account_Title: 'Operating Cash Account',
        Account_Class: 'ASSET',
        Normal_Balance: 'DEBIT',
        Status: 'ACTIVE',
      },
      {
        Account_Code: '4010',
        Account_Title: 'Enterprise Software Subscriptions',
        Account_Class: 'REVENUE',
        Normal_Balance: 'CREDIT',
        Status: 'ACTIVE',
      },
    ],
  },
  'cost-centers': {
    entityKey: 'cost-centers',
    title: 'Cost Centers & Business Departments',
    domain: 'FINANCE',
    columns: [
      { key: 'code', header: 'Cost_Center_Code', required: true, type: 'string', description: 'Unique cost center code', sample: 'CC-ENG-01' },
      { key: 'name', header: 'Department_Name', required: true, type: 'string', description: 'Department or business unit name', sample: 'Platform Engineering' },
      { key: 'ownerEmail', header: 'Owner_Email', required: true, type: 'email', description: 'Budget authority owner email', sample: 'eng-lead@gigalibs.io' },
      { key: 'parentCostCenter', header: 'Parent_Cost_Center', required: false, type: 'string', description: 'Parent rollup cost center code', sample: 'CC-ENG' },
      { key: 'status', header: 'Status', required: false, type: 'enum', enumValues: ['ACTIVE', 'INACTIVE'], description: 'Department status', sample: 'ACTIVE' },
    ],
    sampleRows: [
      {
        Cost_Center_Code: 'CC-ENG-01',
        Department_Name: 'Platform Engineering',
        Owner_Email: 'eng-lead@gigalibs.io',
        Parent_Cost_Center: 'CC-ENG',
        Status: 'ACTIVE',
      },
    ],
  },
  signers: {
    entityKey: 'signers',
    title: 'Corporate Authorized Signers Directory',
    domain: 'GOVERNANCE',
    columns: [
      { key: 'code', header: 'Signer_ID', required: true, type: 'string', description: 'Corporate signer identifier', sample: 'SGN-001' },
      { key: 'name', header: 'Full_Name', required: true, type: 'string', description: 'Legal name of the authorized corporate officer', sample: 'Sarah Jenkins' },
      { key: 'email', header: 'Corporate_Email', required: true, type: 'email', description: 'Official corporate email for e-signature delivery', sample: 's.jenkins@corp.com' },
      { key: 'title', header: 'Corporate_Title', required: false, type: 'string', description: 'Executive or corporate title', sample: 'Chief Financial Officer' },
      { key: 'signingLimitUsd', header: 'Signing_Limit_USD', required: true, type: 'number', description: 'Maximum delegation of authority (DOA) limit in USD', sample: '500000' },
      { key: 'status', header: 'Status', required: false, type: 'enum', enumValues: ['ACTIVE', 'INACTIVE'], description: 'Signer authority status', sample: 'ACTIVE' },
    ],
    sampleRows: [
      {
        Signer_ID: 'SGN-001',
        Full_Name: 'Sarah Jenkins',
        Corporate_Email: 's.jenkins@corp.com',
        Corporate_Title: 'Chief Financial Officer',
        Signing_Limit_USD: '500000',
        Status: 'ACTIVE',
      },
    ],
  },
};

/**
 * Generates an RFC 4180 CSV template string with headers and sample rows.
 */
export function generateEntityCsvTemplate(entityKey: string): string {
  const spec = MASTER_DATA_TEMPLATE_SPECS[entityKey];
  if (!spec) {
    throw new Error(`Unsupported master data entityKey: ${entityKey}`);
  }

  const headers = spec.columns.map((c) => c.header).join(',');
  const comment = `# Template for ${spec.title} (${spec.entityKey.toUpperCase()}) - GigaLibs Master Data Governance\r\n`;

  const rows = spec.sampleRows.map((row) =>
    spec.columns.map((col) => {
      const val = row[col.header] ?? '';
      return String(val).includes(',') || String(val).includes('"')
        ? `"${String(val).replace(/"/g, '""')}"`
        : String(val);
    }).join(','),
  );

  return comment + headers + '\r\n' + rows.join('\r\n') + '\r\n';
}

export interface ValidationFailure {
  rowNumber: number;
  rawRow: Record<string, string>;
  errors: string[];
}

export interface IngestionValidationResult {
  entityKey: string;
  totalRows: number;
  validCount: number;
  errorCount: number;
  validRecords: Array<{
    code: string;
    name: string;
    domain: string;
    payload: Record<string, any>;
  }>;
  failures: ValidationFailure[];
}

/**
 * Validates parsed CSV/JSON rows against the entity template specification.
 */
export function validateMasterDataImport(
  entityKey: string,
  rawRows: Record<string, string>[],
): IngestionValidationResult {
  const spec = MASTER_DATA_TEMPLATE_SPECS[entityKey];
  if (!spec) {
    throw new Error(`Unsupported master data entityKey: ${entityKey}`);
  }

  const validRecords: IngestionValidationResult['validRecords'] = [];
  const failures: ValidationFailure[] = [];
  const seenCodes = new Set<string>();

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // Accounting for 1-based index and header row
    const errors: string[] = [];
    const payload: Record<string, any> = {};

    let code = '';
    let name = '';

    for (const col of spec.columns) {
      // Find value matching header or key (case-insensitive)
      const entry = Object.entries(row).find(
        ([k]) => k.trim().toLowerCase() === col.header.toLowerCase() || k.trim().toLowerCase() === col.key.toLowerCase(),
      );
      const rawVal = entry ? entry[1]?.trim() : '';

      if (col.required && !rawVal) {
        errors.push(`Missing required field '${col.header}'`);
        continue;
      }

      if (rawVal) {
        if (col.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawVal)) {
          errors.push(`Invalid email format in '${col.header}': ${rawVal}`);
        } else if (col.type === 'currency' && !/^[A-Z]{3}$/i.test(rawVal)) {
          errors.push(`Invalid ISO 4217 3-letter currency in '${col.header}': ${rawVal}`);
        } else if (col.type === 'number' && isNaN(Number(rawVal.replace(/[^0-9.-]+/g, '')))) {
          errors.push(`Invalid numeric value in '${col.header}': ${rawVal}`);
        } else if (col.type === 'enum' && col.enumValues && !col.enumValues.includes(rawVal.toUpperCase())) {
          errors.push(`Invalid value '${rawVal}' for '${col.header}'. Allowed: ${col.enumValues.join(', ')}`);
        }
      }

      // Assign to payload
      payload[col.key] = rawVal;
      if (col.key === 'code') code = rawVal.toUpperCase();
      if (col.key === 'name') name = rawVal;
    }

    // Code uniqueness check in batch
    if (code) {
      if (seenCodes.has(code)) {
        errors.push(`Duplicate code in upload: ${code}`);
      } else {
        seenCodes.add(code);
      }
    }

    if (errors.length > 0) {
      failures.push({
        rowNumber: rowNum,
        rawRow: row,
        errors,
      });
    } else {
      validRecords.push({
        code,
        name,
        domain: spec.domain,
        payload,
      });
    }
  });

  return {
    entityKey,
    totalRows: rawRows.length,
    validCount: validRecords.length,
    errorCount: failures.length,
    validRecords,
    failures,
  };
}
