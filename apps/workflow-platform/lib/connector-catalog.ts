// Connector catalog — 10 seeded production-grade connectors for the Connector Hub.

export interface ConnectorCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export interface ConnectorDefinition {
  id: string;
  slug: string;
  name: string;
  category: string;
  vendor: string;
  icon_emoji: string;
  description: string;
  auth_type: 'OAUTH2' | 'API_KEY' | 'BASIC' | 'BEARER';
  credentials: ConnectorCredentialField[];
  actions: ConnectorAction[];
  webhook_support: boolean;
  status: 'AVAILABLE' | 'BETA' | 'COMING_SOON';
  docs_url: string;
}

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    id: 'conn-salesforce-001', slug: 'salesforce', name: 'Salesforce CRM', category: 'CRM',
    vendor: 'Salesforce', icon_emoji: 'cloud',
    description: 'Sync accounts, opportunities, leads, and custom objects with Salesforce Sales Cloud.',
    auth_type: 'OAUTH2',
    credentials: [
      { key: 'client_id', label: 'Client ID', type: 'text', required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
      { key: 'instance_url', label: 'Instance URL', type: 'url', required: true },
    ],
    actions: [
      { id: 'sf-query', name: 'SOQL Query', description: 'Run a SOQL query.', input_schema: { query: 'string' }, output_schema: { records: 'array' } },
      { id: 'sf-create-account', name: 'Create Account', description: 'Create a Salesforce Account.', input_schema: { name: 'string', industry: 'string' }, output_schema: { id: 'string' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://developer.salesforce.com/docs',
  },
  {
    id: 'conn-stripe-001', slug: 'stripe', name: 'Stripe Payments', category: 'PAYMENTS',
    vendor: 'Stripe', icon_emoji: 'credit_card',
    description: 'Process payments, manage subscriptions, and handle refunds via Stripe APIs.',
    auth_type: 'API_KEY',
    credentials: [{ key: 'secret_key', label: 'Secret Key', type: 'password', required: true }],
    actions: [
      { id: 'stripe-charge', name: 'Create Charge', description: 'Charge a payment method.', input_schema: { amount: 'number', currency: 'string' }, output_schema: { id: 'string', status: 'string' } },
      { id: 'stripe-refund', name: 'Create Refund', description: 'Refund a charge.', input_schema: { charge: 'string', amount: 'number' }, output_schema: { id: 'string' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://stripe.com/docs/api',
  },
  {
    id: 'conn-slack-001', slug: 'slack', name: 'Slack', category: 'COMMUNICATION',
    vendor: 'Slack Technologies', icon_emoji: 'speech_balloon',
    description: 'Send messages and manage notifications in Slack workspaces.',
    auth_type: 'OAUTH2',
    credentials: [{ key: 'bot_token', label: 'Bot OAuth Token', type: 'password', required: true }],
    actions: [
      { id: 'slack-post', name: 'Post Message', description: 'Send a message to a channel.', input_schema: { channel: 'string', text: 'string' }, output_schema: { ok: 'boolean', ts: 'string' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://api.slack.com/methods',
  },
  {
    id: 'conn-gsheets-001', slug: 'google-sheets', name: 'Google Sheets', category: 'SPREADSHEET',
    vendor: 'Google', icon_emoji: 'bar_chart',
    description: 'Read and write rows in Google Sheets spreadsheets.',
    auth_type: 'OAUTH2',
    credentials: [
      { key: 'client_id', label: 'OAuth Client ID', type: 'text', required: true },
      { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', required: true },
    ],
    actions: [
      { id: 'gsheets-append', name: 'Append Row', description: 'Append a row.', input_schema: { spreadsheetId: 'string', range: 'string', values: 'array' }, output_schema: { updatedRows: 'number' } },
      { id: 'gsheets-read', name: 'Get Rows', description: 'Read rows from a range.', input_schema: { spreadsheetId: 'string', range: 'string' }, output_schema: { values: 'array' } },
    ],
    webhook_support: false, status: 'AVAILABLE', docs_url: 'https://developers.google.com/sheets/api',
  },
  {
    id: 'conn-sap-001', slug: 'sap-erp', name: 'SAP ERP', category: 'ERP',
    vendor: 'SAP SE', icon_emoji: 'factory',
    description: 'Integrate with SAP S/4HANA for procurement and finance via OData APIs.',
    auth_type: 'BASIC',
    credentials: [
      { key: 'base_url', label: 'SAP System URL', type: 'url', required: true },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    actions: [
      { id: 'sap-create-po', name: 'Create Purchase Order', description: 'Create a PO in SAP.', input_schema: { vendor: 'string', items: 'array' }, output_schema: { poNumber: 'string' } },
    ],
    webhook_support: false, status: 'AVAILABLE', docs_url: 'https://api.sap.com',
  },
  {
    id: 'conn-coupa-001', slug: 'coupa', name: 'Coupa Procurement', category: 'PROCUREMENT',
    vendor: 'Coupa Software', icon_emoji: 'shopping_cart',
    description: 'Automate purchase requests and invoice approval in Coupa.',
    auth_type: 'BEARER',
    credentials: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'instance_url', label: 'Coupa Instance URL', type: 'url', required: true },
    ],
    actions: [
      { id: 'coupa-req', name: 'Create Requisition', description: 'Submit a purchase requisition.', input_schema: { description: 'string', amount: 'number' }, output_schema: { id: 'number' } },
      { id: 'coupa-approve', name: 'Approve Invoice', description: 'Approve a pending invoice.', input_schema: { invoiceId: 'number' }, output_schema: { approval_status: 'string' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://compass.coupa.com',
  },
  {
    id: 'conn-plaid-001', slug: 'plaid', name: 'Plaid Banking', category: 'BANKING',
    vendor: 'Plaid Inc.', icon_emoji: 'bank',
    description: 'Connect to bank accounts and retrieve transactions via Plaid.',
    auth_type: 'API_KEY',
    credentials: [
      { key: 'client_id', label: 'Client ID', type: 'text', required: true },
      { key: 'secret', label: 'Secret', type: 'password', required: true },
      { key: 'environment', label: 'Environment', type: 'select', required: true, options: ['sandbox', 'development', 'production'] },
    ],
    actions: [
      { id: 'plaid-transactions', name: 'Get Transactions', description: 'Retrieve account transactions.', input_schema: { access_token: 'string', start_date: 'string', end_date: 'string' }, output_schema: { transactions: 'array' } },
      { id: 'plaid-balance', name: 'Get Balance', description: 'Get real-time account balances.', input_schema: { access_token: 'string' }, output_schema: { accounts: 'array' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://plaid.com/docs',
  },
  {
    id: 'conn-netsuite-001', slug: 'netsuite', name: 'NetSuite ERP', category: 'ACCOUNTING',
    vendor: 'Oracle NetSuite', icon_emoji: 'ledger',
    description: 'Sync financial records and journal entries with Oracle NetSuite.',
    auth_type: 'OAUTH2',
    credentials: [
      { key: 'account_id', label: 'Account ID', type: 'text', required: true },
      { key: 'consumer_key', label: 'Consumer Key', type: 'text', required: true },
      { key: 'consumer_secret', label: 'Consumer Secret', type: 'password', required: true },
      { key: 'token_id', label: 'Token ID', type: 'text', required: true },
      { key: 'token_secret', label: 'Token Secret', type: 'password', required: true },
    ],
    actions: [
      { id: 'ns-journal', name: 'Create Journal Entry', description: 'Post a journal entry.', input_schema: { subsidiary: 'string', lines: 'array', memo: 'string' }, output_schema: { id: 'string' } },
    ],
    webhook_support: false, status: 'AVAILABLE', docs_url: 'https://docs.oracle.com/netsuite',
  },
  {
    id: 'conn-hubspot-001', slug: 'hubspot', name: 'HubSpot CRM', category: 'CRM',
    vendor: 'HubSpot Inc.', icon_emoji: 'magnet',
    description: 'Manage contacts, deals, and marketing workflows in HubSpot.',
    auth_type: 'OAUTH2',
    credentials: [{ key: 'access_token', label: 'Private App Token', type: 'password', required: true }],
    actions: [
      { id: 'hs-create-contact', name: 'Create Contact', description: 'Create a new contact.', input_schema: { email: 'string', firstname: 'string', lastname: 'string' }, output_schema: { id: 'string' } },
      { id: 'hs-create-deal', name: 'Create Deal', description: 'Create a deal in the pipeline.', input_schema: { dealname: 'string', amount: 'number', dealstage: 'string' }, output_schema: { id: 'string' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://developers.hubspot.com/docs/api/overview',
  },
  {
    id: 'conn-jira-001', slug: 'jira', name: 'Jira', category: 'TICKETING',
    vendor: 'Atlassian', icon_emoji: 'ticket',
    description: 'Create and update Jira issues and manage project work items.',
    auth_type: 'BASIC',
    credentials: [
      { key: 'base_url', label: 'Jira URL', type: 'url', required: true },
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'api_token', label: 'API Token', type: 'password', required: true },
    ],
    actions: [
      { id: 'jira-create', name: 'Create Issue', description: 'Create a new Jira issue.', input_schema: { project: 'string', summary: 'string', issuetype: 'string' }, output_schema: { id: 'string', key: 'string' } },
      { id: 'jira-search', name: 'Search Issues (JQL)', description: 'Search issues with JQL query.', input_schema: { jql: 'string', maxResults: 'number' }, output_schema: { issues: 'array', total: 'number' } },
    ],
    webhook_support: true, status: 'AVAILABLE', docs_url: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3',
  },
];

export function getConnectorBySlug(slug: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find((c) => c.slug === slug);
}

export function searchConnectors(query: string): ConnectorDefinition[] {
  const q = query.toLowerCase();
  return CONNECTOR_CATALOG.filter(
    (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.slug.includes(q),
  );
}
