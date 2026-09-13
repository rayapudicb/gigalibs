// DEV SEED ONLY — all IDs, EINs, and email addresses are fictional.
// Do NOT use in production; replace with real tenant-sourced data.

/**
 * Enterprise Master Data Catalog & Governance Engine
 *
 * Implements ADR-0002 Governed Metadata & Master Data Boundary.
 * Provides canonical, tenant-scoped reference data for:
 * 1. Customers & Debtors (AR Invoicing, Contracts, E-Sign)
 * 2. Vendors & Suppliers (Spend Management, AP, 3-Way Match, Recovery)
 * 3. Chart of Accounts / GL (Financial Reporting, Double-Entry Balance, Expenses)
 * 4. Cost Centers & Departments (Budget Controls, Approvals, Workflows)
 * 5. Corporate Signers & Directory (E-Signature, Approvals)
 * 6. Tax Jurisdictions & Rates (Compliance, Invoicing)
 */

export type DataClassificationLevel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED_PII'
  | 'FINANCIAL_SOX';

export interface MasterCountry {
  code: string;        // ISO 3166-1 alpha-2
  alpha3: string;      // ISO 3166-1 alpha-3
  numericCode: string; // ISO 3166-1 numeric
  name: string;
  defaultCurrency: string;
  region: 'AMER' | 'EMEA' | 'APAC' | 'LATAM' | 'MENA';
  callingCode: string;
  sovereignty: 'SOVEREIGN_MEMBER' | 'TERRITORY' | 'SPECIAL_ADMIN_REGION';
}

export interface MasterTaxJurisdiction {
  jurisdictionCode: string; // ISO 3166-2 / Statutory code, e.g. US-CA, US-TX, GB-ENG, DE-BY
  countryCode: string;      // ISO 3166-1 alpha-2
  name: string;
  taxType: 'SALES_USE' | 'VAT' | 'GST' | 'JCT' | 'CORPORATE_EXCISE';
  statutoryAuthority: string;
  defaultStandardRatePercent: number;
  dataClassification: DataClassificationLevel;
}

export interface MasterDataClassification {
  tier: DataClassificationLevel;
  name: string;
  description: string;
  legalBasis: string;
  retentionYears: number;
  maskingPolicy: 'NONE' | 'MASK_LAST_FOUR' | 'ENCRYPT_AT_REST_DETERMINISTIC' | 'RESTRICT_DELEGATED';
}

export interface MasterCustomer {
  id: string;
  code: string;
  name: string;
  billingEmail: string;
  taxId: string;
  currency: string;
  paymentTerms: 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'DUE_ON_RECEIPT';
  creditLimitUsd: number;
  status: 'ACTIVE' | 'ON_HOLD' | 'INACTIVE';
  industry: string;
  country: string;
  countryCode?: string;
  jurisdictionCode?: string;
  dataClassification?: DataClassificationLevel;
}

export interface MasterVendor {
  id: string;
  code: string;
  name: string;
  remittanceEmail: string;
  taxId: string;
  defaultCategory: string;
  defaultGlCode: string;
  paymentMethod: 'ACH_DIRECT' | 'WIRE_TRANSFER' | 'CORPORATE_CARD' | 'CHECK';
  currency: string;
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING_W9';
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface MasterAccount {
  code: string;
  title: string;
  category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  standard: 'GAAP / IFRS ASC 205';
  normalBalance: 'DEBIT' | 'CREDIT';
  description: string;
}

export interface MasterCostCenter {
  id: string;
  code: string;
  name: string;
  managerName: string;
  managerEmail: string;
  allocatedBudgetUsd: number;
  spentBudgetUsd: number;
  currency: string;
  department: string;
}

export interface MasterSigner {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  authorityLimitUsd: number;
  signingRole: 'SIGNER' | 'APPROVER' | 'CC_NOTIFICATION' | 'LEGAL_REVIEWER';
}

export const MASTER_CUSTOMERS: MasterCustomer[] = [
  {
    id: 'cust-ent-001',
    code: 'CUST-LOCKHEED',
    name: 'Lockheed Martin Aeronautics',
    billingEmail: 'ar@customer-example-001.example',
    taxId: 'XX-EXAMPLE-001',
    currency: 'USD',
    paymentTerms: 'NET_30',
    creditLimitUsd: 5000000,
    status: 'ACTIVE',
    industry: 'Defense & Aerospace',
    country: 'United States',
    countryCode: 'US',
    jurisdictionCode: 'US-TX',
    dataClassification: 'FINANCIAL_SOX',
  },
  {
    id: 'cust-ent-002',
    code: 'CUST-NORTHROP',
    name: 'Northrop Grumman Mission Systems',
    billingEmail: 'ar@customer-example-002.example',
    taxId: 'XX-EXAMPLE-002',
    currency: 'USD',
    paymentTerms: 'NET_60',
    creditLimitUsd: 3500000,
    status: 'ACTIVE',
    industry: 'Defense Systems',
    country: 'United States',
    countryCode: 'US',
    jurisdictionCode: 'US-VA',
    dataClassification: 'FINANCIAL_SOX',
  },
  {
    id: 'cust-ent-003',
    code: 'CUST-BOEING',
    name: 'The Boeing Company (Defense & Space)',
    billingEmail: 'ar@customer-example-003.example',
    taxId: 'XX-EXAMPLE-003',
    currency: 'USD',
    paymentTerms: 'NET_30',
    creditLimitUsd: 7500000,
    status: 'ACTIVE',
    industry: 'Aerospace Manufacturing',
    country: 'United States',
    countryCode: 'US',
    jurisdictionCode: 'US-WA',
    dataClassification: 'FINANCIAL_SOX',
  },
  {
    id: 'cust-ent-004',
    code: 'CUST-RAYTHEON',
    name: 'RTX Pratt & Whitney Operations',
    billingEmail: 'ar@customer-example-004.example',
    taxId: 'XX-EXAMPLE-004',
    currency: 'USD',
    paymentTerms: 'NET_45',
    creditLimitUsd: 4000000,
    status: 'ACTIVE',
    industry: 'Advanced Propulsion',
    country: 'United States',
    countryCode: 'US',
    jurisdictionCode: 'US-CT',
    dataClassification: 'FINANCIAL_SOX',
  },
  {
    id: 'cust-ent-005',
    code: 'CUST-GENERAL-DYN',
    name: 'General Dynamics Electric Boat',
    billingEmail: 'ar@customer-example-005.example',
    taxId: 'XX-EXAMPLE-005',
    currency: 'USD',
    paymentTerms: 'NET_30',
    creditLimitUsd: 6000000,
    status: 'ACTIVE',
    industry: 'Maritime Defense',
    country: 'United States',
    countryCode: 'US',
    jurisdictionCode: 'US-CT',
    dataClassification: 'FINANCIAL_SOX',
  },
];

export const MASTER_COUNTRIES: MasterCountry[] = [
  // North America (AMER)
  { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States of America', defaultCurrency: 'USD', region: 'AMER', callingCode: '+1', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CA', alpha3: 'CAN', numericCode: '124', name: 'Canada', defaultCurrency: 'CAD', region: 'AMER', callingCode: '+1', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'MX', alpha3: 'MEX', numericCode: '484', name: 'Mexico', defaultCurrency: 'MXN', region: 'LATAM', callingCode: '+52', sovereignty: 'SOVEREIGN_MEMBER' },

  // Europe (EMEA)
  { code: 'GB', alpha3: 'GBR', numericCode: '826', name: 'United Kingdom', defaultCurrency: 'GBP', region: 'EMEA', callingCode: '+44', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'DE', alpha3: 'DEU', numericCode: '276', name: 'Germany', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+49', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'FR', alpha3: 'FRA', numericCode: '250', name: 'France', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+33', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'IT', alpha3: 'ITA', numericCode: '380', name: 'Italy', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+39', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'ES', alpha3: 'ESP', numericCode: '724', name: 'Spain', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+34', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'NL', alpha3: 'NLD', numericCode: '528', name: 'Netherlands', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+31', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CH', alpha3: 'CHE', numericCode: '756', name: 'Switzerland', defaultCurrency: 'CHF', region: 'EMEA', callingCode: '+41', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'SE', alpha3: 'SWE', numericCode: '752', name: 'Sweden', defaultCurrency: 'SEK', region: 'EMEA', callingCode: '+46', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'NO', alpha3: 'NOR', numericCode: '578', name: 'Norway', defaultCurrency: 'NOK', region: 'EMEA', callingCode: '+47', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'DK', alpha3: 'DNK', numericCode: '208', name: 'Denmark', defaultCurrency: 'DKK', region: 'EMEA', callingCode: '+45', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'FI', alpha3: 'FIN', numericCode: '246', name: 'Finland', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+358', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'IE', alpha3: 'IRL', numericCode: '372', name: 'Ireland', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+353', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'BE', alpha3: 'BEL', numericCode: '056', name: 'Belgium', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+32', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'AT', alpha3: 'AUT', numericCode: '040', name: 'Austria', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+43', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'PL', alpha3: 'POL', numericCode: '616', name: 'Poland', defaultCurrency: 'PLN', region: 'EMEA', callingCode: '+48', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'PT', alpha3: 'PRT', numericCode: '620', name: 'Portugal', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+351', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'GR', alpha3: 'GRC', numericCode: '300', name: 'Greece', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+30', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CZ', alpha3: 'CZE', numericCode: '203', name: 'Czechia', defaultCurrency: 'CZK', region: 'EMEA', callingCode: '+420', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'HU', alpha3: 'HUN', numericCode: '348', name: 'Hungary', defaultCurrency: 'HUF', region: 'EMEA', callingCode: '+36', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'RO', alpha3: 'ROU', numericCode: '642', name: 'Romania', defaultCurrency: 'RON', region: 'EMEA', callingCode: '+40', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'LU', alpha3: 'LUX', numericCode: '442', name: 'Luxembourg', defaultCurrency: 'EUR', region: 'EMEA', callingCode: '+352', sovereignty: 'SOVEREIGN_MEMBER' },

  // Asia-Pacific (APAC)
  { code: 'JP', alpha3: 'JPN', numericCode: '392', name: 'Japan', defaultCurrency: 'JPY', region: 'APAC', callingCode: '+81', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'IN', alpha3: 'IND', numericCode: '356', name: 'India', defaultCurrency: 'INR', region: 'APAC', callingCode: '+91', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'SG', alpha3: 'SGP', numericCode: '702', name: 'Singapore', defaultCurrency: 'SGD', region: 'APAC', callingCode: '+65', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'AU', alpha3: 'AUS', numericCode: '036', name: 'Australia', defaultCurrency: 'AUD', region: 'APAC', callingCode: '+61', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'NZ', alpha3: 'NZL', numericCode: '554', name: 'New Zealand', defaultCurrency: 'NZD', region: 'APAC', callingCode: '+64', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'KR', alpha3: 'KOR', numericCode: '410', name: 'South Korea', defaultCurrency: 'KRW', region: 'APAC', callingCode: '+82', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CN', alpha3: 'CHN', numericCode: '156', name: 'China (People\'s Republic)', defaultCurrency: 'CNY', region: 'APAC', callingCode: '+86', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'HK', alpha3: 'HKG', numericCode: '344', name: 'Hong Kong SAR', defaultCurrency: 'HKD', region: 'APAC', callingCode: '+852', sovereignty: 'SPECIAL_ADMIN_REGION' },
  { code: 'TW', alpha3: 'TWN', numericCode: '158', name: 'Taiwan', defaultCurrency: 'TWD', region: 'APAC', callingCode: '+886', sovereignty: 'TERRITORY' },
  { code: 'ID', alpha3: 'IDN', numericCode: '360', name: 'Indonesia', defaultCurrency: 'IDR', region: 'APAC', callingCode: '+62', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'MY', alpha3: 'MYS', numericCode: '458', name: 'Malaysia', defaultCurrency: 'MYR', region: 'APAC', callingCode: '+60', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'TH', alpha3: 'THA', numericCode: '764', name: 'Thailand', defaultCurrency: 'THB', region: 'APAC', callingCode: '+66', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'VN', alpha3: 'VNM', numericCode: '704', name: 'Vietnam', defaultCurrency: 'VND', region: 'APAC', callingCode: '+84', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'PH', alpha3: 'PHL', numericCode: '608', name: 'Philippines', defaultCurrency: 'PHP', region: 'APAC', callingCode: '+63', sovereignty: 'SOVEREIGN_MEMBER' },

  // Middle East & Africa (MENA / EMEA)
  { code: 'AE', alpha3: 'ARE', numericCode: '784', name: 'United Arab Emirates', defaultCurrency: 'AED', region: 'MENA', callingCode: '+971', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'SA', alpha3: 'SAU', numericCode: '682', name: 'Saudi Arabia', defaultCurrency: 'SAR', region: 'MENA', callingCode: '+966', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'QA', alpha3: 'QAT', numericCode: '634', name: 'Qatar', defaultCurrency: 'QAR', region: 'MENA', callingCode: '+974', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'BH', alpha3: 'BHR', numericCode: '048', name: 'Bahrain', defaultCurrency: 'BHD', region: 'MENA', callingCode: '+973', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'KW', alpha3: 'KWT', numericCode: '414', name: 'Kuwait', defaultCurrency: 'KWD', region: 'MENA', callingCode: '+965', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'OM', alpha3: 'OMN', numericCode: '512', name: 'Oman', defaultCurrency: 'OMR', region: 'MENA', callingCode: '+968', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'IL', alpha3: 'ISR', numericCode: '376', name: 'Israel', defaultCurrency: 'ILS', region: 'MENA', callingCode: '+972', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'TR', alpha3: 'TUR', numericCode: '792', name: 'Turkey', defaultCurrency: 'TRY', region: 'EMEA', callingCode: '+90', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'ZA', alpha3: 'ZAF', numericCode: '710', name: 'South Africa', defaultCurrency: 'ZAR', region: 'EMEA', callingCode: '+27', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'EG', alpha3: 'EGY', numericCode: '818', name: 'Egypt', defaultCurrency: 'EGP', region: 'MENA', callingCode: '+20', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'NG', alpha3: 'NGA', numericCode: '566', name: 'Nigeria', defaultCurrency: 'NGN', region: 'EMEA', callingCode: '+234', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'KE', alpha3: 'KEN', numericCode: '404', name: 'Kenya', defaultCurrency: 'KES', region: 'EMEA', callingCode: '+254', sovereignty: 'SOVEREIGN_MEMBER' },

  // Latin America (LATAM)
  { code: 'BR', alpha3: 'BRA', numericCode: '076', name: 'Brazil', defaultCurrency: 'BRL', region: 'LATAM', callingCode: '+55', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'AR', alpha3: 'ARG', numericCode: '032', name: 'Argentina', defaultCurrency: 'ARS', region: 'LATAM', callingCode: '+54', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CL', alpha3: 'CHL', numericCode: '152', name: 'Chile', defaultCurrency: 'CLP', region: 'LATAM', callingCode: '+56', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'CO', alpha3: 'COL', numericCode: '170', name: 'Colombia', defaultCurrency: 'COP', region: 'LATAM', callingCode: '+57', sovereignty: 'SOVEREIGN_MEMBER' },
  { code: 'PE', alpha3: 'PER', numericCode: '604', name: 'Peru', defaultCurrency: 'PEN', region: 'LATAM', callingCode: '+51', sovereignty: 'SOVEREIGN_MEMBER' },
];

export const MASTER_TAX_JURISDICTIONS: MasterTaxJurisdiction[] = [
  // United States (Key 50 States + DC)
  { jurisdictionCode: 'US-CA', countryCode: 'US', name: 'California Department of Tax and Fee Administration (CDTFA)', taxType: 'SALES_USE', statutoryAuthority: 'CDTFA Board of Equalization', defaultStandardRatePercent: 7.25, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-NY', countryCode: 'US', name: 'New York State Department of Taxation and Finance', taxType: 'SALES_USE', statutoryAuthority: 'NYS Tax Dept', defaultStandardRatePercent: 8.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-TX', countryCode: 'US', name: 'Texas Comptroller of Public Accounts', taxType: 'SALES_USE', statutoryAuthority: 'Texas Comptroller', defaultStandardRatePercent: 6.25, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-WA', countryCode: 'US', name: 'Washington State Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'WA DOR B&O', defaultStandardRatePercent: 6.5, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-VA', countryCode: 'US', name: 'Virginia Department of Taxation', taxType: 'SALES_USE', statutoryAuthority: 'VA Tax', defaultStandardRatePercent: 5.3, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-MA', countryCode: 'US', name: 'Massachusetts Department of Revenue (DOR)', taxType: 'SALES_USE', statutoryAuthority: 'Mass DOR', defaultStandardRatePercent: 6.25, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-FL', countryCode: 'US', name: 'Florida Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'Florida DOR', defaultStandardRatePercent: 6.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-IL', countryCode: 'US', name: 'Illinois Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'IDOR', defaultStandardRatePercent: 6.25, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-PA', countryCode: 'US', name: 'Pennsylvania Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'PA Revenue', defaultStandardRatePercent: 6.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-OH', countryCode: 'US', name: 'Ohio Department of Taxation', taxType: 'SALES_USE', statutoryAuthority: 'Ohio Tax', defaultStandardRatePercent: 5.75, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-GA', countryCode: 'US', name: 'Georgia Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'Georgia DOR', defaultStandardRatePercent: 4.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-NC', countryCode: 'US', name: 'North Carolina Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'NCDOR', defaultStandardRatePercent: 4.75, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-NJ', countryCode: 'US', name: 'New Jersey Division of Taxation', taxType: 'SALES_USE', statutoryAuthority: 'NJ Treasury', defaultStandardRatePercent: 6.625, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-CO', countryCode: 'US', name: 'Colorado Department of Revenue', taxType: 'SALES_USE', statutoryAuthority: 'CDOR', defaultStandardRatePercent: 2.9, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'US-DC', countryCode: 'US', name: 'District of Columbia Office of Tax and Revenue', taxType: 'SALES_USE', statutoryAuthority: 'DC OTR', defaultStandardRatePercent: 6.0, dataClassification: 'FINANCIAL_SOX' },

  // Canada (Provinces)
  { jurisdictionCode: 'CA-ON', countryCode: 'CA', name: 'Canada Revenue Agency (CRA Ontario HST)', taxType: 'GST', statutoryAuthority: 'CRA Harmonized Sales Tax', defaultStandardRatePercent: 13.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'CA-QC', countryCode: 'CA', name: 'Revenu Québec (GST + QST)', taxType: 'GST', statutoryAuthority: 'Revenu Québec', defaultStandardRatePercent: 14.975, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'CA-BC', countryCode: 'CA', name: 'British Columbia Ministry of Finance (GST + PST)', taxType: 'GST', statutoryAuthority: 'BC Tax', defaultStandardRatePercent: 12.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'CA-AB', countryCode: 'CA', name: 'Canada Revenue Agency (Alberta GST Only)', taxType: 'GST', statutoryAuthority: 'CRA Federal', defaultStandardRatePercent: 5.0, dataClassification: 'FINANCIAL_SOX' },

  // United Kingdom & Europe
  { jurisdictionCode: 'GB-ENG', countryCode: 'GB', name: 'HM Revenue & Customs (HMRC Standard VAT UK)', taxType: 'VAT', statutoryAuthority: 'HMRC Standard VAT UK', defaultStandardRatePercent: 20.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'DE-FED', countryCode: 'DE', name: 'Bundeszentralamt für Steuern (Federal VAT Germany)', taxType: 'VAT', statutoryAuthority: 'BZSt Deutschland', defaultStandardRatePercent: 19.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'DE-BY', countryCode: 'DE', name: 'Finanzamt Bayern (Bavaria Corporate VAT)', taxType: 'VAT', statutoryAuthority: 'Finanzamt München', defaultStandardRatePercent: 19.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'FR-IDF', countryCode: 'FR', name: 'Direction Générale des Finances Publiques (DGFiP TVA)', taxType: 'VAT', statutoryAuthority: 'DGFiP Île-de-France', defaultStandardRatePercent: 20.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'IT-FED', countryCode: 'IT', name: 'Agenzia delle Entrate (Imposta sul Valore Aggiunto IVA)', taxType: 'VAT', statutoryAuthority: 'Agenzia delle Entrate', defaultStandardRatePercent: 22.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'ES-FED', countryCode: 'ES', name: 'Agencia Tributaria (IVA España)', taxType: 'VAT', statutoryAuthority: 'AEAT España', defaultStandardRatePercent: 21.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'NL-FED', countryCode: 'NL', name: 'Belastingdienst (BTW Nederland)', taxType: 'VAT', statutoryAuthority: 'Belastingdienst', defaultStandardRatePercent: 21.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'IE-FED', countryCode: 'IE', name: 'Office of the Revenue Commissioners (Ireland VAT)', taxType: 'VAT', statutoryAuthority: 'Irish Revenue', defaultStandardRatePercent: 23.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'CH-FED', countryCode: 'CH', name: 'Federal Tax Administration FTA (Swiss MWST/TVA)', taxType: 'VAT', statutoryAuthority: 'ESTV Bern', defaultStandardRatePercent: 8.1, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'SE-FED', countryCode: 'SE', name: 'Skatteverket (Moms Sverige)', taxType: 'VAT', statutoryAuthority: 'Skatteverket', defaultStandardRatePercent: 25.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'PL-FED', countryCode: 'PL', name: 'Krajowa Administracja Skarbowa (VAT Polska)', taxType: 'VAT', statutoryAuthority: 'KAS Polska', defaultStandardRatePercent: 23.0, dataClassification: 'FINANCIAL_SOX' },

  // Asia-Pacific
  { jurisdictionCode: 'JP-13', countryCode: 'JP', name: 'National Tax Agency Japan (Tokyo Regional JCT)', taxType: 'JCT', statutoryAuthority: 'National Tax Agency JCT', defaultStandardRatePercent: 10.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'IN-MH', countryCode: 'IN', name: 'Maharashtra Goods & Services Tax Department', taxType: 'GST', statutoryAuthority: 'Central Board of Indirect Taxes & Customs (CBIC)', defaultStandardRatePercent: 18.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'IN-KA', countryCode: 'IN', name: 'Karnataka Commercial Taxes Department', taxType: 'GST', statutoryAuthority: 'CBIC Karnataka', defaultStandardRatePercent: 18.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'IN-DL', countryCode: 'IN', name: 'Delhi Department of Trade and Taxes', taxType: 'GST', statutoryAuthority: 'CBIC Delhi', defaultStandardRatePercent: 18.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'SG-SIN', countryCode: 'SG', name: 'Inland Revenue Authority of Singapore (IRAS GST)', taxType: 'GST', statutoryAuthority: 'IRAS Singapore', defaultStandardRatePercent: 9.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'AU-NSW', countryCode: 'AU', name: 'Australian Taxation Office (ATO GST NSW)', taxType: 'GST', statutoryAuthority: 'ATO Federal Division', defaultStandardRatePercent: 10.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'AU-VIC', countryCode: 'AU', name: 'Australian Taxation Office (ATO GST Victoria)', taxType: 'GST', statutoryAuthority: 'ATO Federal Division', defaultStandardRatePercent: 10.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'NZ-FED', countryCode: 'NZ', name: 'Inland Revenue Department (IRD GST New Zealand)', taxType: 'GST', statutoryAuthority: 'IRD NZ', defaultStandardRatePercent: 15.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'KR-11', countryCode: 'KR', name: 'National Tax Service South Korea (Seoul VAT)', taxType: 'VAT', statutoryAuthority: 'NTS Korea', defaultStandardRatePercent: 10.0, dataClassification: 'FINANCIAL_SOX' },

  // Middle East & Latin America
  { jurisdictionCode: 'AE-DXB', countryCode: 'AE', name: 'Federal Tax Authority UAE (Dubai VAT)', taxType: 'VAT', statutoryAuthority: 'FTA United Arab Emirates', defaultStandardRatePercent: 5.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'AE-AUH', countryCode: 'AE', name: 'Federal Tax Authority UAE (Abu Dhabi VAT)', taxType: 'VAT', statutoryAuthority: 'FTA Abu Dhabi', defaultStandardRatePercent: 5.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'SA-RIY', countryCode: 'SA', name: 'Zakat, Tax and Customs Authority (ZATCA Riyadh)', taxType: 'VAT', statutoryAuthority: 'ZATCA Saudi Arabia', defaultStandardRatePercent: 15.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'BR-SP', countryCode: 'BR', name: 'Secretaria da Fazenda de São Paulo (ICMS/ISS SP)', taxType: 'CORPORATE_EXCISE', statutoryAuthority: 'SEFAZ-SP', defaultStandardRatePercent: 18.0, dataClassification: 'FINANCIAL_SOX' },
  { jurisdictionCode: 'MX-FED', countryCode: 'MX', name: 'Servicio de Administración Tributaria (SAT IVA México)', taxType: 'VAT', statutoryAuthority: 'SAT México', defaultStandardRatePercent: 16.0, dataClassification: 'FINANCIAL_SOX' },
];


export const MASTER_DATA_CLASSIFICATIONS: MasterDataClassification[] = [
  { tier: 'PUBLIC', name: 'Public Reference Data', description: 'Open standards, ISO codes, and public regulatory constants available to all systems.', legalBasis: 'Open Access / Non-Confidential', retentionYears: 99, maskingPolicy: 'NONE' },
  { tier: 'INTERNAL', name: 'Internal Business Operations', description: 'Internal cost centers, operational workflows, and team routing rosters.', legalBasis: 'Corporate Governance Policy', retentionYears: 7, maskingPolicy: 'NONE' },
  { tier: 'CONFIDENTIAL', name: 'Confidential Commercial', description: 'Customer agreements, commercial pricing, vendor discount schedules, and margin structures.', legalBasis: 'Commercial NDA / Trade Secret Protection', retentionYears: 10, maskingPolicy: 'RESTRICT_DELEGATED' },
  { tier: 'RESTRICTED_PII', name: 'Restricted Personally Identifiable Information', description: 'Personal identities, taxpayer identification numbers (EIN/SSN), billing contact records, and corporate officer signatures.', legalBasis: 'GDPR Art. 6/9, CCPA, HIPAA Safe Harbor', retentionYears: 7, maskingPolicy: 'MASK_LAST_FOUR' },
  { tier: 'FINANCIAL_SOX', name: 'Statutory Financial & Audit Ledger', description: 'Immutable double-entry general ledger, sales tax calculation records, invoices, cryptographic seals, and Treasury FX settlements.', legalBasis: 'Sarbanes-Oxley Act Sec 404, GAAP / IFRS ASC 205, IRS Rev Proc', retentionYears: 10, maskingPolicy: 'ENCRYPT_AT_REST_DETERMINISTIC' },
];

export const MASTER_VENDORS: MasterVendor[] = [
  {
    id: 'vend-001',
    code: 'VEND-AWS',
    name: 'Amazon Web Services Inc',
    remittanceEmail: 'ar@vendor-example-001.example',
    taxId: 'XX-EXAMPLE-006',
    defaultCategory: 'Cloud Hosting & Bare Metal GPU',
    defaultGlCode: '6020',
    paymentMethod: 'ACH_DIRECT',
    currency: 'USD',
    status: 'ACTIVE',
    riskScore: 'LOW',
  },
  {
    id: 'vend-002',
    code: 'VEND-ORACLE',
    name: 'Oracle Americas Cloud Operations',
    remittanceEmail: 'ar@vendor-example-002.example',
    taxId: 'XX-EXAMPLE-007',
    defaultCategory: 'Database & Enterprise Licensing',
    defaultGlCode: '6020',
    paymentMethod: 'WIRE_TRANSFER',
    currency: 'USD',
    status: 'ACTIVE',
    riskScore: 'LOW',
  },
  {
    id: 'vend-003',
    code: 'VEND-DELL',
    name: 'Dell Technologies Enterprise Storage',
    remittanceEmail: 'ar@vendor-example-003.example',
    taxId: 'XX-EXAMPLE-008',
    defaultCategory: 'Hardware & Bare Metal Equipment',
    defaultGlCode: '1010',
    paymentMethod: 'ACH_DIRECT',
    currency: 'USD',
    status: 'ACTIVE',
    riskScore: 'LOW',
  },
  {
    id: 'vend-004',
    code: 'VEND-CDTFA',
    name: 'California Dept of Tax & Fee Admin (CDTFA)',
    remittanceEmail: 'tax.remit@gov-example.example',
    taxId: 'XX-EXAMPLE-GOV-001',
    defaultCategory: 'Statutory Sales Tax Remittance',
    defaultGlCode: '2150',
    paymentMethod: 'ACH_DIRECT',
    currency: 'USD',
    status: 'ACTIVE',
    riskScore: 'LOW',
  },
  {
    id: 'vend-005',
    code: 'VEND-SALESFORCE',
    name: 'Salesforce Enterprise Software',
    remittanceEmail: 'ar@vendor-example-004.example',
    taxId: 'XX-EXAMPLE-009',
    defaultCategory: 'SaaS Customer Operations Software',
    defaultGlCode: '6020',
    paymentMethod: 'CORPORATE_CARD',
    currency: 'USD',
    status: 'ACTIVE',
    riskScore: 'LOW',
  },
];

export const MASTER_ACCOUNTS: MasterAccount[] = [
  { code: '1010', title: 'Operating Cash & Treasury Reserves', category: 'ASSET', standard: 'GAAP / IFRS ASC 205', normalBalance: 'DEBIT', description: 'Federal Reserve and commercial operating liquidity.' },
  { code: '1200', title: 'Accounts Receivable (Invoiced WIP)', category: 'ASSET', standard: 'GAAP / IFRS ASC 205', normalBalance: 'DEBIT', description: 'Uncollected customer invoices and trade receivables.' },
  { code: '2010', title: 'Accounts Payable & Trade Liabilities', category: 'LIABILITY', standard: 'GAAP / IFRS ASC 205', normalBalance: 'CREDIT', description: 'Approved supplier invoices due for disbursement.' },
  { code: '2150', title: 'Sales Tax & Statutory Remittance Payable', category: 'LIABILITY', standard: 'GAAP / IFRS ASC 205', normalBalance: 'CREDIT', description: 'Collected state sales tax and EU VAT awaiting remittance.' },
  { code: '3010', title: 'Common Stock & Retained Earnings', category: 'EQUITY', standard: 'GAAP / IFRS ASC 205', normalBalance: 'CREDIT', description: 'Paid-in shareholder equity and accumulated earnings.' },
  { code: '4010', title: 'Enterprise SaaS & Production Revenue', category: 'REVENUE', standard: 'GAAP / IFRS ASC 205', normalBalance: 'CREDIT', description: 'GAAP ASC 606 subscription and usage revenue recognized.' },
  { code: '5010', title: 'Contractor Labor & Direct Production Cost', category: 'EXPENSE', standard: 'GAAP / IFRS ASC 205', normalBalance: 'DEBIT', description: 'COGS direct labor and subcontractor task order allocations.' },
  { code: '6020', title: 'Cloud Infrastructure & Sovereign Operations', category: 'EXPENSE', standard: 'GAAP / IFRS ASC 205', normalBalance: 'DEBIT', description: 'AWS, Oracle, and GPU compute expenses.' },
];

export const MASTER_COST_CENTERS: MasterCostCenter[] = [
  {
    id: 'cc-100',
    code: 'CC-ENG-100',
    name: 'Core Platform Engineering',
    managerName: 'Alex Rivera, VP Engineering',
    managerEmail: 'alex.rivera@gigalibs.io',
    allocatedBudgetUsd: 1800000,
    spentBudgetUsd: 420000,
    currency: 'USD',
    department: 'Engineering',
  },
  {
    id: 'cc-200',
    code: 'CC-OPS-200',
    name: 'Sovereign Cloud Operations',
    managerName: 'Elena Rostova, Director SRE',
    managerEmail: 'elena.rostova@gigalibs.io',
    allocatedBudgetUsd: 1200000,
    spentBudgetUsd: 380000,
    currency: 'USD',
    department: 'Operations',
  },
  {
    id: 'cc-300',
    code: 'CC-FIN-300',
    name: 'Treasury & Corporate FinOps',
    managerName: 'Marcus Vance, Corporate Controller',
    managerEmail: 'marcus.vance@gigalibs.io',
    allocatedBudgetUsd: 850000,
    spentBudgetUsd: 145000,
    currency: 'USD',
    department: 'Finance',
  },
  {
    id: 'cc-400',
    code: 'CC-SALES-400',
    name: 'Global Enterprise Sales & Field Ops',
    managerName: 'Sarah Jenkins, CRO',
    managerEmail: 'sarah.jenkins@gigalibs.io',
    allocatedBudgetUsd: 2100000,
    spentBudgetUsd: 790000,
    currency: 'USD',
    department: 'Sales',
  },
];

export const MASTER_SIGNERS: MasterSigner[] = [
  {
    id: 'sgn-001',
    name: 'Jane Doe',
    email: 'jane.doe@gigalibs.example',
    title: 'Chief Legal Officer & General Counsel',
    department: 'Legal',
    authorityLimitUsd: 10000000,
    signingRole: 'SIGNER',
  },
  {
    id: 'sgn-002',
    name: 'Marcus Vance',
    email: 'marcus.vance@gigalibs.io',
    title: 'Corporate Controller & Treasurer',
    department: 'Finance',
    authorityLimitUsd: 5000000,
    signingRole: 'APPROVER',
  },
  {
    id: 'sgn-003',
    name: 'Sarah Connor',
    email: 'sarah.connor@example.com',
    title: 'VP of Strategic Procurement',
    department: 'Procurement',
    authorityLimitUsd: 2500000,
    signingRole: 'SIGNER',
  },
  {
    id: 'sgn-004',
    name: 'Dr. Evelyn Reed',
    email: 'evelyn.reed@example.com',
    title: 'Executive Director of Regulatory Compliance',
    department: 'Compliance',
    authorityLimitUsd: 1000000,
    signingRole: 'LEGAL_REVIEWER',
  },
];

export const MASTER_CATEGORIES = [
  'Cloud Hosting & Bare Metal GPU',
  'Software Subscriptions & SaaS',
  'Hardware & Bare Metal Equipment',
  'Professional & Legal Advisory',
  'Contractor Labor & Direct Staffing',
  'Statutory Sales Tax Remittance',
  'Office Facilities & Infrastructure',
  'Travel, Flight & Field Logistics',
] as const;
