export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface ApiTenant {
  id: string;
  name: string;
  slug: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE' | 'TRIAL' | 'CANCELLED';
  isolationMode: 'DEDICATED_DATABASE' | 'SCHEMA_ISOLATED' | 'ROW_LEVEL_SECURITY';
  region: string;
  customDomain: string | null;
  plan: string | null;
  provisionedAt: string | null;
  createdAt: string;
  updatedAt: string;
  membershipRole?: string;
}

export interface TenantSettings {
  tenantId: string;
  version: number;
  branding: {
    appName: string;
    primaryColor: string;
    customDomain?: string;
    emailSenderName?: string;
    emailSenderAddress?: string;
  };
  security: {
    enforceMfa: boolean;
    passwordMinLength: number;
    passwordExpiryDays: number;
    sessionTimeoutMinutes: number;
    maxFailedLoginAttempts: number;
    allowedIpRanges: string[];
  };
  localization: {
    defaultLocale: string;
    defaultCurrency: string;
    timezone: string;
    dateFormat: string;
  };
  features: Record<string, boolean>;
  metadata: Record<string, unknown>;
}

export interface RegisteredModule {
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
    capabilities: string[];
    requires: Record<string, string>;
    permissions: string[];
    healthChecks: string[];
  };
  status: 'READY' | 'BLOCKED' | 'DISABLED';
  problems: string[];
}

export interface ApiPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  trialDays: number;
  features: string[];
  prices: Array<{
    id: string;
    currency: string;
    unitAmount: number; // in cents
    interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
    intervalCount: number;
  }>;
}

export interface ApiSubscription {
  id: string;
  tenantId: string;
  planId: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: ApiPlan;
  invoices: ApiInvoice[];
}

export interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  dueDate: string | null;
  paidAt: string | null;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
  }>;
}

export interface ApiWorkflowPipeline {
  id: string;
  name: string;
  targetApp: string;
  description: string | null;
  status: string;
  totalRuns: number;
  successRate: number;
  definition: any;
  runs: ApiWorkflowRun[];
}

export interface ApiWorkflowRun {
  id: string;
  pipelineId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'QUARANTINED';
  durationMs: number;
  creditsSettled: number;
  startedAt: string;
  completedAt: string | null;
  executionLog?: any;
}

export class ControlPlaneApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ControlPlaneApiError';
  }
}

const tokenStorageKey = 'gigalibs.control-plane.tokens.v1';

export class ControlPlaneClient {
  private tokens: AuthTokens | null = null;
  private refreshInFlight: Promise<AuthTokens> | null = null;

  constructor(readonly baseUrl: string) {
    const stored = localStorage.getItem(tokenStorageKey);
    if (stored) {
      try {
        this.tokens = JSON.parse(stored) as AuthTokens;
      } catch {
        localStorage.removeItem(tokenStorageKey);
      }
    }
  }

  hasSession(): boolean {
    return this.tokens !== null;
  }

  // ─── AUTHENTICATION (PURE DATABASE ONLY — ZERO MOCK FALLBACKS) ──────────────
  async register(input: { name: string; email: string; password: string }): Promise<void> {
    const tokens = await this.request<AuthTokens>('/auth/register', { method: 'POST', body: input }, false);
    this.storeTokens(tokens);
  }

  async login(input: { email: string; password: string }): Promise<void> {
    const tokens = await this.request<AuthTokens>('/auth/login', { method: 'POST', body: input }, false);
    this.storeTokens(tokens);
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST' });
    } finally {
      this.clearSession();
    }
  }

  clearSession(): void {
    this.tokens = null;
    localStorage.removeItem(tokenStorageKey);
  }

  // ─── TENANTS & SETTINGS (REAL DATABASE CRUD) ─────────────────────────────────
  async listTenants(): Promise<ApiTenant[]> {
    return this.request<ApiTenant[]>('/tenants');
  }

  async createTenant(input: {
    name: string;
    slug: string;
    plan: string;
    isolationMode: ApiTenant['isolationMode'];
    region: string;
  }): Promise<ApiTenant> {
    return this.request<ApiTenant>('/tenants', { method: 'POST', body: input });
  }

  async changeTenantStatus(
    tenantId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE' | 'CANCELLED',
    reason: string,
  ): Promise<ApiTenant> {
    return this.request<ApiTenant>('/tenants/current/status', {
      method: 'PATCH',
      tenantId,
      body: { status, reason },
    });
  }

  async getSettings(tenantId: string): Promise<TenantSettings> {
    return this.request<TenantSettings>('/settings', { tenantId });
  }

  async updateSettings(
    tenantId: string,
    patch: Record<string, unknown>,
  ): Promise<TenantSettings> {
    return this.request<TenantSettings>('/settings', { method: 'PATCH', tenantId, body: patch });
  }

  async listModules(): Promise<RegisteredModule[]> {
    return this.request<RegisteredModule[]>('/modules');
  }

  // ─── BILLING, PLANS & INVOICES (REAL DATABASE CRUD) ──────────────────────────
  async getPlans(): Promise<ApiPlan[]> {
    return this.request<ApiPlan[]>('/billing/plans');
  }

  async getTenantSubscription(tenantId: string): Promise<ApiSubscription | null> {
    return this.request<ApiSubscription | null>(`/billing/subscription/${tenantId}`);
  }

  async subscribe(input: { tenantId: string; planSlug: string; paymentMethod?: string }): Promise<ApiSubscription> {
    return this.request<ApiSubscription>('/billing/subscribe', { method: 'POST', body: input });
  }

  async getInvoices(tenantId: string): Promise<ApiInvoice[]> {
    return this.request<ApiInvoice[]>(`/billing/invoices/${tenantId}`);
  }

  // ─── WORKFLOWS & EXECUTION RUNS (REAL DATABASE CRUD) ─────────────────────────
  async getWorkflowPipelines(tenantId?: string): Promise<ApiWorkflowPipeline[]> {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return this.request<ApiWorkflowPipeline[]>(`/workflows/pipelines${query}`);
  }

  async triggerWorkflowRun(input: { pipelineId: string; tenantId: string; inputPayload?: any }): Promise<ApiWorkflowRun> {
    return this.request<ApiWorkflowRun>('/workflows/run', { method: 'POST', body: input });
  }

  async getWorkflowRuns(tenantId?: string): Promise<ApiWorkflowRun[]> {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return this.request<ApiWorkflowRun[]>(`/workflows/runs${query}`);
  }

  // ─── HTTP ENGINE ─────────────────────────────────────────────────────────────
  private async refresh(): Promise<AuthTokens> {
    if (!this.tokens?.refreshToken) throw new ControlPlaneApiError(401, 'SESSION_REQUIRED', 'Sign in is required.');
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.request<AuthTokens>(
        '/auth/refresh',
        { method: 'POST', body: { refreshToken: this.tokens.refreshToken } },
        false,
      )
        .then((tokens) => {
          this.storeTokens(tokens);
          return tokens;
        })
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  private storeTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
    localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      tenantId?: string;
    } = {},
    retryOnUnauthorized = true,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.tokens?.accessToken && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      headers.Authorization = `Bearer ${this.tokens.accessToken}`;
    }
    if (options.tenantId) headers['X-Tenant-ID'] = options.tenantId;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    if (response.status === 401 && retryOnUnauthorized && this.tokens?.refreshToken) {
      try {
        await this.refresh();
        return this.request<T>(path, options, false);
      } catch (error) {
        this.clearSession();
        throw error;
      }
    }

    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!response.ok) {
      const errorPayload = payload ?? {};
      throw new ControlPlaneApiError(
        response.status,
        typeof errorPayload['code'] === 'string' ? errorPayload['code'] : 'REQUEST_FAILED',
        typeof errorPayload['message'] === 'string' ? errorPayload['message'] : `Request failed with status ${response.status}.`,
        errorPayload['details'],
      );
    }
    return payload as T;
  }
}

const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const controlPlaneClient = new ControlPlaneClient(configuredApiUrl ?? '/api/v1');
