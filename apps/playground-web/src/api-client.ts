/**
 * @gigalibs/playground-web - Unified Real-Time REST API Client
 * Connects frontend modules directly to apps/playground-api (Port 3000)
 */

export interface ApiClientConfig {
  baseUrl?: string;
  tenantId?: string;
  authToken?: string;
}

export class ApiClient {
  private static baseUrl = '/api/v1';
  private static tenantId = 'warner-bros';
  private static authToken = '';

  static configure(config: ApiClientConfig) {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.tenantId) this.tenantId = config.tenantId;
    if (config.authToken) this.authToken = config.authToken;
  }

  static getTenantId(): string {
    return this.tenantId;
  }

  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': this.tenantId,
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  // Generic HTTP Methods
  static async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`API GET ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  static async post<T>(path: string, body: any): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API POST ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  static async patch<T>(path: string, body?: any): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`API PATCH ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  static async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`API DELETE ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  // ─── DOMAIN API WRAPPERS ───────────────────────────────────────────────────

  // Clients
  static async listClients(tenantId = this.tenantId) {
    return this.get<any[]>(`/clients/${tenantId}`);
  }

  static async createClient(clientData: any, tenantId = this.tenantId) {
    return this.post<any>(`/clients/${tenantId}`, clientData);
  }

  // Products
  static async listProducts(tenantId = this.tenantId) {
    return this.get<any[]>(`/products/${tenantId}`);
  }

  static async createProduct(productData: any, tenantId = this.tenantId) {
    return this.post<any>(`/products/${tenantId}`, productData);
  }

  // Invoices & WIP Billing
  static async listInvoices(tenantId = this.tenantId) {
    return this.get<any[]>(`/invoices/${tenantId}`);
  }

  static async getProjectWipSummary(projectId: string, tenantId = this.tenantId) {
    return this.get<any>(`/invoices/wip/${tenantId}/${projectId}`);
  }

  static async listBillableRecords(projectId?: string, tenantId = this.tenantId) {
    const query = projectId ? `?projectId=${projectId}` : '';
    return this.get<any[]>(`/invoices/billable-records/${tenantId}${query}`);
  }

  static async createBillableRecord(data: any, tenantId = this.tenantId) {
    return this.post<any>(`/invoices/billable-records/${tenantId}`, data);
  }

  static async updateBillableApproval(recordId: string, approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED', tenantId = this.tenantId) {
    return this.patch<any>(`/invoices/billable-records/${tenantId}/${recordId}/approval`, { approvalStatus });
  }

  static async bulkImportBillableRecords(records: any[], tenantId = this.tenantId) {
    return this.post<any>(`/invoices/billable-records/${tenantId}/bulk-import`, { records });
  }

  static async generateIncrementalInvoice(payload: { projectOrEventId: string; customerName?: string; baseInvoiceNumber?: string; defaultMarkupPercent?: number; notes?: string }, tenantId = this.tenantId) {
    return this.post<any>(`/invoices/generate-incremental/${tenantId}`, payload);
  }

  static async voidInvoice(invoiceId: string, voidReason: string, voidedBy: string, tenantId = this.tenantId) {
    return this.post<any>(`/invoices/${tenantId}/${invoiceId}/void`, { voidReason, voidedBy });
  }

  static async syncToAccounting(invoiceId: string, provider = 'QUICKBOOKS_ONLINE', externalCustomerId?: string, tenantId = this.tenantId) {
    return this.post<any>(`/invoices/${tenantId}/${invoiceId}/sync-accounting`, { provider, externalCustomerId });
  }

  static async createInvoice(invoiceData: any, tenantId = this.tenantId) {
    return this.post<any>(`/invoices/${tenantId}`, invoiceData);
  }

  static async markInvoicePaid(invoiceId: string, tenantId = this.tenantId) {
    return this.patch<any>(`/invoices/${tenantId}/${invoiceId}/pay`);
  }

  // Subscriptions & Plans
  static async listPlans() {
    return this.get<any[]>(`/billing/plans`);
  }

  static async getTenantSubscription(tenantId = this.tenantId) {
    return this.get<any>(`/billing/subscription/${tenantId}`);
  }

  // Tickets
  static async listTickets(tenantId = this.tenantId) {
    return this.get<any[]>(`/tickets/${tenantId}`);
  }

  static async createTicket(ticketData: any, tenantId = this.tenantId) {
    return this.post<any>(`/tickets/${tenantId}`, ticketData);
  }

  // Ledger
  static async listLedgerAccounts() {
    return this.get<any[]>(`/ledger/accounts`);
  }

  static async listJournalEntries(tenantId = this.tenantId) {
    return this.get<any[]>(`/ledger/entries/${tenantId}`);
  }

  static async postJournalEntry(entryData: any, tenantId = this.tenantId) {
    return this.post<any>(`/ledger/entries/${tenantId}`, entryData);
  }

  // Teams & Roles
  static async listMembers(tenantId = this.tenantId) {
    return this.get<any[]>(`/teams/members/${tenantId}`);
  }

  static async listRoles(tenantId = this.tenantId) {
    return this.get<any[]>(`/teams/roles/${tenantId}`);
  }

  static async createRole(roleData: any, tenantId = this.tenantId) {
    return this.post<any>(`/teams/roles/${tenantId}`, roleData);
  }

  // Workflows
  static async listWorkflowPipelines(tenantId = this.tenantId) {
    return this.get<any[]>(`/workflows/pipelines/${tenantId}`);
  }

  // Forms
  static async listForms(tenantId = this.tenantId) {
    return this.get<any[]>(`/forms/${tenantId}`);
  }

  static async createForm(formData: any, tenantId = this.tenantId) {
    return this.post<any>(`/forms/${tenantId}`, formData);
  }

  static async submitForm(formId: string, payload: any) {
    return this.post<any>(`/forms/submit/${formId}`, payload);
  }

  // Billing & Subscriptions
  static async getSubscription(tenantId = this.tenantId) {
    return this.get<any>(`/billing/subscription/${tenantId}`);
  }

  static async subscribe(planSlug: string, paymentMethod?: string, tenantId = this.tenantId) {
    return this.post<any>(`/billing/subscribe`, { tenantId, planSlug, paymentMethod });
  }

  static async cancelSubscription(tenantId = this.tenantId) {
    return this.post<any>(`/billing/cancel/${tenantId}`, {});
  }

  static async getBillingInvoices(tenantId = this.tenantId) {
    return this.get<any[]>(`/billing/invoices/${tenantId}`);
  }

  // Analytics & KPIs
  static async getExecutiveKpis(tenantId = this.tenantId) {
    return this.get<any>(`/analytics/kpis/${tenantId}`);
  }

  // Fraud Detection
  static async getFraudQueue(tenantId = this.tenantId) {
    return this.get<any[]>(`/fraud/queue/${tenantId}`);
  }

  static async assessFraud(payload: any, tenantId = this.tenantId) {
    return this.post<any>(`/fraud/assess/${tenantId}`, payload);
  }

  static async resolveFraudCase(logId: string, resolution: 'APPROVED' | 'BLOCKED') {
    return this.patch<any>(`/fraud/resolve/${logId}`, { resolution });
  }

  // Tax Nexus Configuration
  static async getTaxNexus(tenantId = this.tenantId) {
    return this.get<any[]>(`/tax/nexus/${tenantId}`);
  }

  static async activateTaxNexus(data: any, tenantId = this.tenantId) {
    return this.post<any>(`/tax/nexus/${tenantId}`, data);
  }

  static async deactivateTaxNexus(stateCode: string, tenantId = this.tenantId) {
    return this.delete<any>(`/tax/nexus/${tenantId}/${stateCode}`);
  }

  // Tenants (Platform Admin)
  static async listTenants() {
    return this.get<any[]>(`/tenants`);
  }

  static async getTenantMetrics(tenantId: string) {
    return this.get<any>(`/tenants/${tenantId}/metrics`);
  }

  // Workflow Runs (Execution History)
  static async listWorkflowRuns(tenantId = this.tenantId) {
    return this.get<any[]>(`/workflows/runs?tenantId=${tenantId}`);
  }

  static async persistWorkflowRun(runData: any, tenantId = this.tenantId) {
    return this.post<any>(`/workflows/run`, { ...runData, tenantId });
  }

  // Universal Business Rules (AST)
  static async listRules(tenantId = this.tenantId) {
    return this.get<any[]>(`/rules/${tenantId}`);
  }

  static async saveRule(rule: any, tenantId = this.tenantId) {
    return this.post<any>(`/rules/${tenantId}`, rule);
  }

  static async deleteRule(ruleId: string, tenantId = this.tenantId) {
    return this.delete<any>(`/rules/${tenantId}/${ruleId}`);
  }

  static async evaluateRules(facts: Record<string, any>, tenantId = this.tenantId) {
    return this.post<any>(`/rules/${tenantId}/evaluate`, { facts });
  }

  // Document OCR & AI Processing
  static async listOcrDocuments(tenantId = this.tenantId) {
    return this.get<any[]>(`/ocr/documents/${tenantId}`);
  }

  static async processOcrDocument(doc: any, tenantId = this.tenantId) {
    return this.post<any>(`/ocr/process/${tenantId}`, doc);
  }

  // Cryptographic E-Signatures
  static async listEsignEnvelopes(tenantId = this.tenantId) {
    return this.get<any[]>(`/esign/envelopes/${tenantId}`);
  }

  static async createEsignEnvelope(envelope: any, tenantId = this.tenantId) {
    return this.post<any>(`/esign/envelopes/${tenantId}`, envelope);
  }

  static async signEsignEnvelope(envelopeId: string, email: string) {
    return this.post<any>(`/esign/sign/${envelopeId}`, { email });
  }

  // Maps & Geofencing Zones
  static async listGeofenceZones(tenantId = this.tenantId) {
    return this.get<any[]>(`/geofence/${tenantId}`);
  }

  static async createGeofenceZone(zone: any, tenantId = this.tenantId) {
    return this.post<any>(`/geofence/${tenantId}`, zone);
  }

  static async deleteGeofenceZone(zoneId: string, tenantId = this.tenantId) {
    return this.delete<any>(`/geofence/${tenantId}/${zoneId}`);
  }

  // Orders & Headless Checkout
  static async listOrders(tenantId = this.tenantId) {
    return this.get<any[]>(`/orders/${tenantId}`);
  }

  static async checkoutOrder(order: any, tenantId = this.tenantId) {
    return this.post<any>(`/orders/checkout/${tenantId}`, order);
  }

  // Form Submissions
  static async listFormSubmissions(tenantId = this.tenantId) {
    return this.get<any[]>(`/forms/${tenantId}/submissions`);
  }
}
