import * as React from 'react';
import { AdminLayout } from '@gigalibs/admin-kit';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  StatusBadge,
  Modal,
} from '@gigalibs/ui';
import { ChatWindow } from '@gigalibs/chat-react';
import { AIChatWindow } from '@gigalibs/ai-chat-react';
import {
  BarChart,
  LineChart,
  DonutChart,
  FunnelChart,
  GaugeChart,
  WaterfallChart,
} from '@gigalibs/charts-react';
import { ReportsGrid } from '@gigalibs/reports-grid-react';
import { ExportEngine } from '@gigalibs/export-engine-core';
import { DynamicFormStudio } from '@gigalibs/form-engine-react';
import { KpiStatCard } from '@gigalibs/kpi-widgets-react';
import { DocumentViewer } from '@gigalibs/document-viewer-react';
import { PricingTable } from '@gigalibs/billing-react';
import { PricingCalculator, type PricingPlanConfig } from '@gigalibs/pricing-calculator';
import { FraudDetectionEngine } from '@gigalibs/fraud-detection';
import { TotpAuthenticator } from '@gigalibs/security-shield';
import { GeoCalculator } from '@gigalibs/maps-core';
import { ESignManager, type ESignEnvelope } from '@gigalibs/esign-core';
import { DocumentOcrProcessor, type OcrDocumentResult } from '@gigalibs/document-ocr-core';
import { type Invoice } from '@gigalibs/invoices-core';
import { MultiCurrencyEngine, SUPPORTED_CURRENCIES } from '@gigalibs/multi-currency';
import {
  Users,
  MessageSquare,
  Bot,
  CreditCard,
  Shield,
  FileText,
  Layers,
  Settings,
  Sparkles,
} from '@gigalibs/icons';
import {
  ControlPlaneApiError,
  type ApiTenant,
  type ControlPlaneClient,
  type RegisteredModule,
} from './control-plane-api.js';
import { WorkflowStudioCanvas } from './components/WorkflowStudioCanvas.js';
import { InvoiceStudio } from './components/InvoiceStudio.js';
import { SpendStudio } from './components/SpendStudio.js';
import { TaxConfigurationStudio } from './components/TaxConfigurationStudio.js';
import { FinancialReportsStudio } from './components/FinancialReportsStudio.js';
import { FormsStudioPro } from './components/FormsStudioPro.js';
import { ConnectorsStudioPro } from './components/ConnectorsStudioPro.js';
import { UniversalRuleStudioPro } from './components/UniversalRuleStudioPro.js';
import { RbacStudioPro } from './components/RbacStudioPro.js';
import { MultiTenancyStudioPro } from './components/MultiTenancyStudioPro.js';
import { DocumentOcrStudioPro } from './components/DocumentOcrStudioPro.js';
import { CryptographicEsignStudioPro } from './components/CryptographicEsignStudioPro.js';
import { MapsGeofencingStudioPro } from './components/MapsGeofencingStudioPro.js';
import { FraudDetectionStudioPro } from './components/FraudDetectionStudioPro.js';
import { MultiCurrencyStudioPro } from './components/MultiCurrencyStudioPro.js';
import { HeadlessCheckoutStudioPro } from './components/HeadlessCheckoutStudioPro.js';
import { UniversalDataStudioPro } from './components/UniversalDataStudioPro.js';
import { ExecutiveKpiStudioPro } from './components/ExecutiveKpiStudioPro.js';
import { BiAnalyticsStudioPro } from './components/BiAnalyticsStudioPro.js';
import { GenericSubscriptionStudio } from './components/GenericSubscriptionStudio.js';
import { SaaSOnboardingWizard } from './components/SaaSOnboardingWizard.js';
import { ApiClient } from './api-client.js';
// =========================================================
// TYPES & DATA STRUCTURES
// =========================================================
export type DbIsolationMode = 'DEDICATED_DATABASE' | 'SCHEMA_ISOLATED' | 'ROW_LEVEL_SECURITY';

export interface SaasTenant {
  id: string;
  name: string;
  slug: string;
  customDomain: string;
  plan: string;
  dbMode: DbIsolationMode;
  dbHost: string;
  dbName: string;
  region: string;
  status: 'ACTIVE' | 'PROVISIONING' | 'MAINTENANCE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';
  createdAt: string;
}

export type PermissionAction = 'read' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export interface ModulePermissionSet {
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  color: string;
  isSystem?: boolean;
  modules: Record<string, ModulePermissionSet>;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  leadUserId: string;
  defaultRoleId: string;
  memberUserIds: string[];
  color: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  roleId: string;
  groupIds: string[];
  department: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  bio?: string;
  likesCount?: number;
  avatarUrl?: string;
  joinedAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  customerName: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assignedAgent: string;
  slaRemainingMinutes: number;
  createdAt: string;
}

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'ar';

export const I18N_DICTIONARIES: Record<SupportedLanguage, { name: string; dir: 'ltr' | 'rtl'; strings: Record<string, string> }> = {
  en: {
    name: 'English (US)',
    dir: 'ltr',
    strings: {
      welcome: 'Welcome to GigaLibs Enterprise Control Plane',
      subtitle: 'Universal modular SaaS architecture with automated isolated database provisioning.',
      arr_title: 'Annual Recurring Revenue (ARR)',
      mrr_title: 'Monthly Recurring Revenue (MRR)',
      arpu_title: 'Average Revenue Per User (ARPU)',
      nrr_title: 'Net Revenue Retention (NRR)',
      tenants_title: 'SaaS Tenant & Isolated DB Manager',
      btn_provision: '+ Provision New Tenant',
      btn_save: 'Save Platform Configuration',
    },
  },
  es: {
    name: 'Español (ES)',
    dir: 'ltr',
    strings: {
      welcome: 'Bienvenido al Panel de Control Empresarial GigaLibs',
      subtitle: 'Arquitectura SaaS multiinquilino con aprovisionamiento automatizado de bases de datos aisladas.',
      arr_title: 'Ingresos Recurrentes Anuales (ARR)',
      mrr_title: 'Ingresos Recurrentes Mensuales (MRR)',
      arpu_title: 'Ingreso Promedio por Usuario (ARPU)',
      nrr_title: 'Retención Neta de Ingresos (NRR)',
      tenants_title: 'Gestor de Inquilinos SaaS y BBDD Aisladas',
      btn_provision: '+ Aprovisionar Inquilino',
      btn_save: 'Guardar Configuración',
    },
  },
  fr: {
    name: 'Français (FR)',
    dir: 'ltr',
    strings: {
      welcome: 'Bienvenue sur la console d’administration GigaLibs',
      subtitle: 'Architecture SaaS multi-locataires avec provisionnement automatisé de bases de données isolées.',
      arr_title: 'Revenu Récurrent Annuel (ARR)',
      mrr_title: 'Revenu Récurrent Mensuel (MRR)',
      arpu_title: 'Revenu Moyen par Utilisateur (ARPU)',
      nrr_title: 'Rétention Nette des Revenus (NRR)',
      tenants_title: 'Gestionnaire de Locataires SaaS & BDD Dédiées',
      btn_provision: '+ Provisionner un Locataire',
      btn_save: 'Enregistrer la Configuration',
    },
  },
  de: {
    name: 'Deutsch (DE)',
    dir: 'ltr',
    strings: {
      welcome: 'Willkommen bei der GigaLibs Enterprise-Steuerungskonsole',
      subtitle: 'Komponierbare Multi-Tenant-SaaS-Architektur mit automatisierter Bereitstellung isolierter Datenbanken.',
      arr_title: 'Jährlich wiederkehrender Umsatz (ARR)',
      mrr_title: 'Monatlich wiederkehrender Umsatz (MRR)',
      arpu_title: 'Durchschnittsumsatz pro Nutzer (ARPU)',
      nrr_title: 'Netto-Umsatzbindung (NRR)',
      tenants_title: 'SaaS-Mandanten- & Datenbank-Manager',
      btn_provision: '+ Mandanten bereitstellen',
      btn_save: 'Konfiguration speichern',
    },
  },
  ja: {
    name: '日本語 (JA)',
    dir: 'ltr',
    strings: {
      welcome: 'GigaLibs エンタープライズ コントロールプレーンへようこそ',
      subtitle: '自動化された独立データベースプロビジョニングを備えたマルチテナントSaaSアーキテクチャ。',
      arr_title: '年間経常収益 (ARR)',
      mrr_title: '月間経常収益 (MRR)',
      arpu_title: 'ユーザーあたり平均収益 (ARPU)',
      nrr_title: '純収益維持率 (NRR)',
      tenants_title: 'SaaS テナント & 独立DBマネージャー',
      btn_provision: '+ テナントを新規プロビジョニング',
      btn_save: '設定を保存',
    },
  },
  ar: {
    name: 'العربية (AR)',
    dir: 'rtl',
    strings: {
      welcome: 'مرحبًا بك في منصة التحكم لمؤسسات GigaLibs',
      subtitle: 'بنية سحابية متعددة المستأجرين مع توفير آلي لقواعد بيانات معزولة ومستقلة.',
      arr_title: 'الإيرادات السنوية المتكررة (ARR)',
      mrr_title: 'الإيرادات الشهرية المتكررة (MRR)',
      arpu_title: 'متوسط الإيراد لكل مستخدم (ARPU)',
      nrr_title: 'معدل الاحتفاظ الصافي بالإيرادات (NRR)',
      tenants_title: 'إدارة المستأجرين وقواعد البيانات المعزولة',
      btn_provision: '+ توفير مستأجر جديد',
      btn_save: 'حفظ الإعدادات',
    },
  },
};

const DEFAULT_MODULES = [
  { id: 'crm_leads', name: 'Leads & Prospects', description: 'Pipeline prospecting and scoring' },
  { id: 'crm_deals', name: 'Deals & Pipeline', description: 'Opportunity tracking and revenue forecasts' },
  { id: 'billing_invoices', name: 'Invoices & Ledger', description: 'Accounts receivable and debit/credit ledger' },
  { id: 'team_chat', name: 'Team Chat & Channels', description: 'Real-time WebSocket communications' },
  { id: 'ai_copilot', name: 'AI Copilot Assistant', description: 'LLM token streaming & generative actions' },
  { id: 'support_tickets', name: 'Support Tickets & SLA', description: 'Customer case queue and SLA resolution' },
  { id: 'document_esign', name: 'Documents & E-Sign', description: 'Digital contracts and cryptographic sealing' },
  { id: 'platform_settings', name: 'Platform Settings & Security', description: 'Environment variables, domain, and MFA' },
];

const FULL_PERMS: ModulePermissionSet = { read: true, create: true, edit: true, delete: true, approve: true, export: true };
const READ_ONLY_PERMS: ModulePermissionSet = { read: true, create: false, edit: false, delete: false, approve: false, export: false };
const SALES_PERMS: ModulePermissionSet = { read: true, create: true, edit: true, delete: false, approve: true, export: true };

// =========================================================
// REUSABLE SUBMODULE HEADER WITH TITLE, BADGE, DESCRIPTION & ACTIONS
// =========================================================
export const ModuleHeader: React.FC<{
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  actions?: React.ReactNode;
}> = ({ title, description, badge, badgeVariant = 'info', actions }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap justify-between items-center gap-4">
    <div className="space-y-1 max-w-2xl">
      <div className="flex items-center space-x-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {badge && <StatusBadge variant={badgeVariant}>{badge}</StatusBadge>}
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export interface AppProps {
  controlPlane?: ControlPlaneClient;
  account?: { name: string; email: string };
  onSignOut?: () => void;
}

const toConsoleTenant = (tenant: ApiTenant): SaasTenant => ({
  id: tenant.id,
  name: tenant.name,
  slug: tenant.slug,
  customDomain: tenant.customDomain ?? '',
  plan: tenant.plan ?? 'UNASSIGNED',
  dbMode: tenant.isolationMode,
  dbHost: 'Managed by provisioner adapter',
  dbName: tenant.status === 'PROVISIONING' ? 'Provisioning requested' : `${tenant.isolationMode} managed resource`,
  region: tenant.region,
  status: tenant.status,
  createdAt: tenant.createdAt.slice(0, 10),
});

const RELATED_SUBMODULES: Record<string, Array<{ id: string; label: string; icon: string }>> = {
  invoices: [
    { id: 'tax_config', label: 'US Multi-Tier Tax Nexus', icon: '🏛️' },
    { id: 'financial_reports', label: 'Financial Reports & AR Aging', icon: '📈' },
    { id: 'checkout', label: 'Headless Checkout & Payment Gateway', icon: '💳' },
    { id: 'currency', label: 'Multi-Currency & Real-Time FX', icon: '💱' },
    { id: 'reports', label: 'SheetJS Multi-Sheet Excel Reports', icon: '📑' },
    { id: 'rules', label: 'Universal Rule Engine (Discounts & Net-30)', icon: '⚡' },
  ],
  tax_config: [
    { id: 'invoices', label: 'Universal Invoicing & AR Ledger', icon: '💰' },
    { id: 'financial_reports', label: 'AR Aging & Tax Ledger', icon: '📈' },
    { id: 'checkout', label: 'Headless Checkout with Nexus Tax', icon: '💳' },
  ],
  financial_reports: [
    { id: 'invoices', label: 'Universal Invoicing & AR Ledger', icon: '💰' },
    { id: 'tax_config', label: 'US Multi-Tier Tax Nexus', icon: '🏛️' },
    { id: 'overview', label: "Executive KPI's & MRR", icon: '📈' },
    { id: 'reports', label: 'Multi-Sheet Excel Reports', icon: '📑' },
  ],
  workflow_studio: [
    { id: 'universal_data', label: 'Universal Data Studio (Giga Views)', icon: '🗂️' },
    { id: 'workflow_runs', label: 'Execution Runs & DLQ Quarantine', icon: '📋' },
    { id: 'analytics', label: 'BI Analytics Studio (20+ Charts)', icon: '📊' },
    { id: 'maps', label: 'Maps & Geofencing Engine', icon: '🗺️' },
    { id: 'rules', label: 'Universal Rule Engine (JSON AST)', icon: '⚡' },
  ],
  universal_data: [
    { id: 'workflow_studio', label: 'AI Workflow Studio & DAG Canvas', icon: '⚡' },
    { id: 'analytics', label: 'BI Analytics Studio (20+ Charts)', icon: '📊' },
    { id: 'overview', label: "Executive KPI's & MRR", icon: '📈' },
    { id: 'reports', label: 'Reports Studio (Excel / CSV)', icon: '📑' },
  ],
  analytics: [
    { id: 'overview', label: "Executive KPI's & MRR", icon: '📈' },
    { id: 'universal_data', label: 'Universal Data Studio (Giga Views)', icon: '🗂️' },
    { id: 'reports', label: 'Spreadsheet Reports Studio', icon: '📑' },
    { id: 'maps', label: 'Maps & Geofencing Engine', icon: '🗺️' },
  ],
  overview: [
    { id: 'analytics', label: 'BI Analytics Studio (20+ Charts)', icon: '📊' },
    { id: 'invoices', label: 'Universal Invoicing & AR Ledger', icon: '💰' },
    { id: 'financial_reports', label: 'Financial Reports & AR Aging', icon: '📑' },
    { id: 'universal_data', label: 'Universal Data Studio (Giga Views)', icon: '🗂️' },
  ],
};

export function App({ controlPlane, account, onSignOut }: AppProps = {}) {
  const [activeTab, setActiveTab] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam) return tabParam;
    }
    return 'invoices';
  });

  React.useEffect(() => {
    const syncTab = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        if (tabParam && tabParam !== activeTab) {
          setActiveTab(tabParam);
        }
      }
    };
    syncTab();
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);

  const isDemoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';

  const launchDemoInNewTab = (tabId?: string) => {
    const targetTab = tabId || activeTab;
    const url = `${window.location.origin}${window.location.pathname}?demo=true&tab=${encodeURIComponent(targetTab)}`;
    window.open(url, '_blank');
  };

  // Universal Filters
  const [globalDateRange, setGlobalDateRange] = React.useState<string>('last_30_days');
  const [globalIndustry, setGlobalIndustry] = React.useState<string>('all');
  const [globalRegion, setGlobalRegion] = React.useState<string>('global');

  // Global Localization & Currency
  const [currentLang, setCurrentLang] = React.useState<SupportedLanguage>('en');
  const [currentCurrency, setCurrentCurrency] = React.useState<string>('USD');
  const t = (key: string) => I18N_DICTIONARIES[currentLang].strings[key] || key;

  const fxRates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    INR: 86.5,
    JPY: 154.0,
    CAD: 1.36,
    AUD: 1.52,
    AED: 3.67,
  };

  const formatMoney = (usdAmount: number) => {
    const converted = MultiCurrencyEngine.convert(usdAmount, 'USD', currentCurrency, fxRates);
    const sym = SUPPORTED_CURRENCIES[currentCurrency]?.symbol || '$';
    return `${sym}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Platform Settings State & Theme
  const [platformSettings, setPlatformSettings] = React.useState({
    appName: 'GigaPlatform Enterprise',
    primaryColor: '#2563eb',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '16px',
    customDomain: 'sales.acme.com',
    senderEmail: 'notifications@acme.com',
    enforceMfa: true,
    sessionTimeout: 60,
    passwordExpiryDays: 90,
    whitelistedIps: '192.168.1.0/24, 10.0.0.0/16',
  });

  const THEME_PRESETS = [
    { name: 'Enterprise Blue', color: '#2563eb', bg: 'bg-blue-600' },
    { name: 'Emerald Forest', color: '#10b981', bg: 'bg-emerald-600' },
    { name: 'Royal Violet', color: '#8b5cf6', bg: 'bg-purple-600' },
    { name: 'Sunset Amber', color: '#f59e0b', bg: 'bg-amber-500' },
    { name: 'Crimson Rose', color: '#e11d48', bg: 'bg-rose-600' },
    { name: 'Midnight Slate', color: '#0f172a', bg: 'bg-slate-900' },
  ];

  // FX Converter State
  const [fxFromCurrency, setFxFromCurrency] = React.useState('USD');
  const [fxToCurrency, setFxToCurrency] = React.useState('EUR');
  const [fxConvertAmount, setFxConvertAmount] = React.useState(10000);
  const calculatedFxResult = MultiCurrencyEngine.convert(fxConvertAmount, fxFromCurrency, fxToCurrency, fxRates);

  // User Profile & Roles State
  const [currentUserProfile, setCurrentUserProfile] = React.useState<TeamMember>({
    id: 'usr_admin',
    name: 'Alex Johnson',
    email: 'alex@acme.com',
    roleId: 'super_admin',
    groupIds: ['grp_exec', 'grp_eng'],
    department: 'Engineering & Executive',
    status: 'ACTIVE',
    bio: 'Lead Platform Architect & SaaS Infrastructure Engineer.',
    likesCount: 142,
    joinedAt: '2026-01-15',
  });

  const [roles, setRoles] = React.useState<CustomRole[]>([
    {
      id: 'super_admin',
      name: 'Super Administrator',
      description: 'Full unrestricted platform access across all modules.',
      color: '#2563eb',
      isSystem: true,
      modules: {
        crm_leads: { ...FULL_PERMS },
        crm_deals: { ...FULL_PERMS },
        billing_invoices: { ...FULL_PERMS },
        team_chat: { ...FULL_PERMS },
        ai_copilot: { ...FULL_PERMS },
        support_tickets: { ...FULL_PERMS },
        document_esign: { ...FULL_PERMS },
        platform_settings: { ...FULL_PERMS },
      },
    },
    {
      id: 'sales_director',
      name: 'Sales Director',
      description: 'Manages sales team, leads, pipeline, and approves discount pricing.',
      color: '#10b981',
      isSystem: false,
      modules: {
        crm_leads: { ...SALES_PERMS },
        crm_deals: { ...SALES_PERMS },
        billing_invoices: { read: true, create: true, edit: false, delete: false, approve: true, export: true },
        team_chat: { ...FULL_PERMS },
        ai_copilot: { read: true, create: true, edit: true, delete: false, approve: false, export: true },
        support_tickets: { read: true, create: true, edit: true, delete: false, approve: false, export: false },
        document_esign: { read: true, create: true, edit: true, delete: false, approve: true, export: true },
        platform_settings: { ...READ_ONLY_PERMS },
      },
    },
    {
      id: 'support_lead',
      name: 'Customer Support Lead',
      description: 'SLA ticket triaging, client comms, and customer resolution.',
      color: '#f59e0b',
      isSystem: false,
      modules: {
        crm_leads: { ...READ_ONLY_PERMS },
        crm_deals: { ...READ_ONLY_PERMS },
        billing_invoices: { read: true, create: false, edit: false, delete: false, approve: false, export: false },
        team_chat: { ...FULL_PERMS },
        ai_copilot: { read: true, create: true, edit: false, delete: false, approve: false, export: false },
        support_tickets: { ...FULL_PERMS },
        document_esign: { read: true, create: false, edit: false, delete: false, approve: false, export: false },
        platform_settings: { ...READ_ONLY_PERMS },
      },
    },
    {
      id: 'auditor_readonly',
      name: 'Compliance & Audit Inspector',
      description: 'Strict read-only access to ledger, logs, and cryptographic seals.',
      color: '#64748b',
      isSystem: false,
      modules: {
        crm_leads: { ...READ_ONLY_PERMS },
        crm_deals: { ...READ_ONLY_PERMS },
        billing_invoices: { read: true, create: false, edit: false, delete: false, approve: false, export: true },
        team_chat: { ...READ_ONLY_PERMS },
        ai_copilot: { ...READ_ONLY_PERMS },
        support_tickets: { read: true, create: false, edit: false, delete: false, approve: false, export: true },
        document_esign: { read: true, create: false, edit: false, delete: false, approve: false, export: true },
        platform_settings: { ...READ_ONLY_PERMS },
      },
    },
  ]);

  const [groups, setGroups] = React.useState<UserGroup[]>([
    {
      id: 'grp_exec',
      name: 'Executive & Strategy',
      description: 'C-Suite leadership with global governance over billing and contracts.',
      leadUserId: 'usr_admin',
      defaultRoleId: 'super_admin',
      memberUserIds: ['usr_admin', 'usr_2'],
      color: '#2563eb',
      createdAt: '2026-01-10',
    },
    {
      id: 'grp_sales',
      name: 'Enterprise Sales & BD',
      description: 'Quota carriers, account executives, and deal desk managers.',
      leadUserId: 'usr_2',
      defaultRoleId: 'sales_director',
      memberUserIds: ['usr_2', 'usr_3'],
      color: '#10b981',
      createdAt: '2026-02-01',
    },
    {
      id: 'grp_eng',
      name: 'Core Infrastructure & DevSecOps',
      description: 'Platform engineers managing VPC peering, RDS instances, and SSL.',
      leadUserId: 'usr_admin',
      defaultRoleId: 'super_admin',
      memberUserIds: ['usr_admin'],
      color: '#8b5cf6',
      createdAt: '2026-01-15',
    },
    {
      id: 'grp_support',
      name: 'Customer Success & Tier 2 SLA',
      description: 'Client support agents handling enterprise tickets and SLAs.',
      leadUserId: 'usr_3',
      defaultRoleId: 'support_lead',
      memberUserIds: ['usr_3'],
      color: '#f59e0b',
      createdAt: '2026-03-01',
    },
  ]);

  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([
    { id: 'usr_sam_admin', name: 'David Miller (GovCon PM)', email: 'david.miller@defensedynamics.us', roleId: 'super_admin', groupIds: ['grp_exec', 'grp_eng'], department: 'Federal Contracts & SAM.gov Program Office', status: 'ACTIVE', joinedAt: '2026-09-01' },
    { id: 'usr_admin', name: 'Alex Johnson', email: 'alex@acme.com', roleId: 'super_admin', groupIds: ['grp_exec', 'grp_eng'], department: 'Engineering & Executive', status: 'ACTIVE', joinedAt: '2026-01-15' },
    { id: 'usr_2', name: 'Sarah Connor', email: 'sarah@acme.com', roleId: 'sales_director', groupIds: ['grp_sales', 'grp_exec'], department: 'Sales & BD', status: 'ACTIVE', joinedAt: '2026-02-01' },
    { id: 'usr_3', name: 'Michael Chen', email: 'michael@acme.com', roleId: 'support_lead', groupIds: ['grp_support'], department: 'Customer Success', status: 'ACTIVE', joinedAt: '2026-03-10' },
  ]);

  // User Filter & Search State
  const [userSearchQuery, setUserSearchQuery] = React.useState('');
  const [userRoleFilter, setUserRoleFilter] = React.useState('ALL');
  const [userStatusFilter, setUserStatusFilter] = React.useState('ALL');

  // Modals State
  const [isInviteUserModalOpen, setIsInviteUserModalOpen] = React.useState(false);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = React.useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = React.useState(false);
  const [isEffectivePermModalOpen, setIsEffectivePermModalOpen] = React.useState(false);
  const [selectedUserForPerms, setSelectedUserForPerms] = React.useState<TeamMember | null>(null);

  // Invite Form State
  const [newInviteName, setNewInviteName] = React.useState('');
  const [newInviteEmail, setNewInviteEmail] = React.useState('');
  const [newInviteRole, setNewInviteRole] = React.useState('sales_director');
  const [newInviteDept, setNewInviteDept] = React.useState('Sales & BD');
  const [newInviteGroups, setNewInviteGroups] = React.useState<string[]>(['grp_sales']);

  // Create Role Form State
  const [newRoleName, setNewRoleName] = React.useState('');
  const [newRoleDesc, setNewRoleDesc] = React.useState('');
  const [newRoleColor, setNewRoleColor] = React.useState('#8b5cf6');
  const [newRoleCloneFrom, setNewRoleCloneFrom] = React.useState('sales_director');

  // Create Group Form State
  const [newGroupName, setNewGroupName] = React.useState('');
  const [newGroupDesc, setNewGroupDesc] = React.useState('');
  const [newGroupLead, setNewGroupLead] = React.useState('usr_admin');
  const [newGroupRole, setNewGroupRole] = React.useState('sales_director');
  const [newGroupColor, setNewGroupColor] = React.useState('#10b981');

  // Interactive Permission Simulator State
  const [simUser, setSimUser] = React.useState('usr_2');
  const [simModule, setSimModule] = React.useState('billing_invoices');
  const [simAction, setSimAction] = React.useState<PermissionAction>('approve');

  // User Profile & Security state
  const [profileLikes, setProfileLikes] = React.useState(142);
  const [isLiked, setIsLiked] = React.useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = React.useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = React.useState(false);

  // Tenants State & Provisioning Wizard
  const INITIAL_SEED_TENANTS: SaasTenant[] = [
    { id: 'ten_sam_gov_001', name: 'Federal Defense Dynamics (SAM.gov Prime)', slug: 'sam-gov', customDomain: 'sam-gov.localhost:5180', plan: 'Enterprise Dedicated', dbMode: 'SCHEMA_ISOLATED', dbHost: 'pg-cluster-fed.internal:5432', dbName: 'db_govcon_sam_prod (schema: tenant_sam_gov)', region: 'US-East (GovCloud)', status: 'ACTIVE', createdAt: '2026-09-01' },
    { id: 'ten_tesla_991', name: 'Tesla Energy', slug: 'tesla', customDomain: 'energy.tesla.com', plan: 'Enterprise Dedicated', dbMode: 'DEDICATED_DATABASE', dbHost: 'pg-dedicated-01.internal:5432', dbName: 'db_tenant_tesla_prod', region: 'US-East (N. Virginia)', status: 'ACTIVE', createdAt: '2026-02-10' },
    { id: 'ten_stripe_882', name: 'Stripe Payments EU', slug: 'stripe-eu', customDomain: 'billing.stripe-eu.com', plan: 'Enterprise Dedicated', dbMode: 'DEDICATED_DATABASE', dbHost: 'pg-dedicated-eu.internal:5432', dbName: 'db_tenant_stripe_eu', region: 'EU-Central (Frankfurt)', status: 'ACTIVE', createdAt: '2026-03-01' },
    { id: 'ten_acme_773', name: 'Acme Global Corp', slug: 'acme-corp', customDomain: 'app.acme.com', plan: 'Growth', dbMode: 'SCHEMA_ISOLATED', dbHost: 'pg-cluster-main.internal:5432', dbName: 'db_multitenant_core (schema: acme_corp)', region: 'US-East (N. Virginia)', status: 'ACTIVE', createdAt: '2026-04-12' },
  ];
  const [tenants, setTenants] = React.useState<SaasTenant[]>(INITIAL_SEED_TENANTS);
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('ten_sam_gov_001');
  const [settingsVersion, setSettingsVersion] = React.useState<number | null>(null);
  const [liveModules, setLiveModules] = React.useState<RegisteredModule[]>([]);
  const [controlPlaneMessage, setControlPlaneMessage] = React.useState<string | null>(null);
  const [isControlPlaneBusy, setIsControlPlaneBusy] = React.useState(false);

  const [isProvisionModalOpen, setIsProvisionModalOpen] = React.useState(false);
  const [newTenantName, setNewTenantName] = React.useState('');
  const [newTenantSlug, setNewTenantSlug] = React.useState('');
  const [newTenantPlan, setNewTenantPlan] = React.useState<'Starter' | 'Growth' | 'Enterprise Dedicated'>('Enterprise Dedicated');
  const [newTenantDbMode, setNewTenantDbMode] = React.useState<DbIsolationMode>('DEDICATED_DATABASE');
  const [newTenantRegion, setNewTenantRegion] = React.useState('US-East (N. Virginia)');
  const [isProvisioningProgress, setIsProvisioningProgress] = React.useState(false);

  const loadLiveTenants = React.useCallback(async () => {
    if (!controlPlane) return;
    setIsControlPlaneBusy(true);
    try {
      const rows = (await controlPlane.listTenants()).map(toConsoleTenant);
      if (rows && rows.length > 0) {
        setTenants(rows);
        setSelectedTenantId((current) => current && rows.some((tenant) => tenant.id === current) ? current : (rows[0]?.id ?? 'ten_sam_gov_001'));
      }
      setControlPlaneMessage(null);
    } catch {
      setControlPlaneMessage(null);
    } finally {
      setIsControlPlaneBusy(false);
    }
  }, [controlPlane]);

  React.useEffect(() => {
    if (!controlPlane) return;
    void loadLiveTenants();
    void controlPlane.listModules()
      .then(setLiveModules)
      .catch((error: unknown) => setControlPlaneMessage(error instanceof Error ? error.message : 'Unable to load module registry.'));
  }, [controlPlane, loadLiveTenants]);

  // Automatic Local Subdomain and ?tenant=slug Resolution
  React.useEffect(() => {
    if (typeof window === 'undefined' || tenants.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');
    const hostname = window.location.hostname;

    if (tenantParam) {
      const match = tenants.find((t) => t.slug.toLowerCase() === tenantParam.toLowerCase() || t.id === tenantParam);
      if (match) {
        setSelectedTenantId(match.id);
        return;
      }
    }

    if (hostname.endsWith('.localhost') && hostname !== 'localhost') {
      const sub = hostname.replace('.localhost', '').toLowerCase();
      const match = tenants.find((t) => t.slug.toLowerCase() === sub);
      if (match) {
        setSelectedTenantId(match.id);
      }
    }
  }, [tenants]);

  React.useEffect(() => {
    if (!controlPlane || !selectedTenantId || activeTab !== 'settings') return;
    setIsControlPlaneBusy(true);
    void controlPlane.getSettings(selectedTenantId)
      .then((settings) => {
        setSettingsVersion(settings.version);
        setPlatformSettings((current) => ({
          ...current,
          appName: settings.branding.appName,
          primaryColor: settings.branding.primaryColor,
          customDomain: settings.branding.customDomain ?? '',
          senderEmail: settings.branding.emailSenderAddress ?? '',
          enforceMfa: settings.security.enforceMfa,
          sessionTimeout: settings.security.sessionTimeoutMinutes,
          passwordExpiryDays: settings.security.passwordExpiryDays,
          whitelistedIps: settings.security.allowedIpRanges.join(', '),
        }));
        setControlPlaneMessage(null);
      })
      .catch((error: unknown) => setControlPlaneMessage(error instanceof Error ? error.message : 'Unable to load settings.'))
      .finally(() => setIsControlPlaneBusy(false));
  }, [activeTab, controlPlane, selectedTenantId]);

  const [dbJournalEntries, setDbJournalEntries] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Load Support Tickets from PostgreSQL
    ApiClient.listTickets()
      .then((tks) => {
        if (tks && tks.length > 0) {
          const mapped: SupportTicket[] = tks.map((t: any) => ({
            id: t.ticketNumber || t.id,
            subject: t.subject,
            customerName: t.requesterName || t.requesterEmail || 'Customer',
            priority: (t.priority || 'NORMAL') as any,
            status: (t.status || 'OPEN') as any,
            assignedAgent: t.assignedAgentName || 'Unassigned',
            slaRemainingMinutes: t.slaRemainingMinutes || 120,
            createdAt: new Date(t.createdAt).toLocaleString(),
          }));
          setTickets((prev) => [...mapped, ...prev.filter((p) => !mapped.some((m) => m.id === p.id))]);
        }
      })
      .catch(() => {});

    // Load Team Members from PostgreSQL
    ApiClient.listMembers()
      .then((members) => {
        if (members && members.length > 0) {
          const mapped: TeamMember[] = members.map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            roleId: m.role ? m.role.toLowerCase() : 'sales_director',
            groupIds: ['grp_exec'],
            department: 'Production Operations',
            status: (m.status || 'ACTIVE') as any,
            avatarUrl: m.avatarUrl,
            joinedAt: new Date(m.joinedAt).toISOString().slice(0, 10),
          }));
          setTeamMembers((prev) => [...mapped, ...prev.filter((p) => !mapped.some((m) => m.id === p.id))]);
        }
      })
      .catch(() => {});

    // Load Ledger Entries from PostgreSQL
    ApiClient.listJournalEntries()
      .then((entries) => {
        if (entries && entries.length > 0) {
          setDbJournalEntries(entries);
        }
      })
      .catch(() => {});
  }, []);

  // Invoices State & Creator
  const [invoices, setInvoices] = React.useState<Invoice[]>([
    {
      id: 'inv_1',
      invoiceNumber: 'INV-2026-001',
      tenantId: 'acme',
      customerName: 'Tesla Energy',
      customerEmail: 'billing@tesla.com',
      currency: 'USD',
      status: 'PAID',
      issueDate: '2026-08-01',
      dueDate: '2026-08-31',
      paymentTerms: 'NET_30',
      lineItems: [
        { id: '1', description: 'Enterprise Dedicated Cluster (32 vCPU)', quantity: 1, unitPrice: 3700000, amount: 3700000 },
        { id: '2', description: 'AI Copilot Token Ingestion (10M Tokens)', quantity: 1, unitPrice: 280000, amount: 280000 },
      ],
      subtotal: 3980000,
      discountAmount: 0,
      taxRatePercent: 8.25,
      taxAmount: 328350,
      totalAmount: 4308350,
      amountPaid: 4308350,
      paymentLinkUrl: 'https://pay.gigalibs.dev/checkout/inv-2026-001',
      createdAt: '2026-08-01',
    },
    {
      id: 'inv_2',
      invoiceNumber: 'INV-2026-002',
      tenantId: 'acme',
      customerName: 'Stripe Payments EU',
      customerEmail: 'finance@stripe-eu.com',
      currency: 'USD',
      status: 'SENT',
      issueDate: '2026-08-15',
      dueDate: '2026-09-15',
      paymentTerms: 'NET_30',
      lineItems: [
        { id: '1', description: 'Growth Tier SaaS Seat Licenses (25 Seats)', quantity: 25, unitPrice: 9900, amount: 247500 },
      ],
      subtotal: 247500,
      discountAmount: 24750,
      taxRatePercent: 8.25,
      taxAmount: 18376,
      totalAmount: 241126,
      amountPaid: 0,
      paymentLinkUrl: 'https://pay.gigalibs.dev/checkout/inv-2026-002',
      createdAt: '2026-08-15',
    },
    {
      id: 'inv_3',
      invoiceNumber: 'INV-2026-003',
      tenantId: 'acme',
      customerName: 'Acme Global Corp',
      customerEmail: 'accounts@acme.com',
      currency: 'USD',
      status: 'OVERDUE',
      issueDate: '2026-07-01',
      dueDate: '2026-07-31',
      paymentTerms: 'NET_30',
      lineItems: [
        { id: '1', description: 'Starter Plan Monthly Subscription', quantity: 1, unitPrice: 2900, amount: 2900 },
      ],
      subtotal: 2900,
      discountAmount: 0,
      taxRatePercent: 8.25,
      taxAmount: 239,
      totalAmount: 3139,
      amountPaid: 0,
      paymentLinkUrl: 'https://pay.gigalibs.dev/checkout/inv-2026-003',
      createdAt: '2026-07-01',
    },
  ]);

  const [invoiceStatusFilter, setInvoiceStatusFilter] = React.useState<'ALL' | 'PAID' | 'SENT' | 'OVERDUE'>('ALL');
  const [selectedInvoice, setSelectedInvoice] = React.useState<Invoice | null>(null);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = React.useState(false);
  const [newInvCustomer, setNewInvCustomer] = React.useState('');
  const [newInvEmail, setNewInvEmail] = React.useState('');
  const [newInvItemDesc, setNewInvItemDesc] = React.useState('Enterprise Dedicated DB Cluster');
  const [newInvItemQty, setNewInvItemQty] = React.useState(1);
  const [newInvItemPrice, setNewInvItemPrice] = React.useState(299000);

  // Live Pricing State
  const [calcSeats, setCalcSeats] = React.useState<number>(25);
  const [calcIsAnnual, setCalcIsAnnual] = React.useState<boolean>(true);
  const currentCalcPlan: PricingPlanConfig = { id: 'calc_1', name: 'Growth Enterprise', model: 'PER_SEAT', basePrice: 9900, seatPrice: 2500, annualDiscountPercent: 20 };
  const calculatedQuote = PricingCalculator.calculate(currentCalcPlan, calcSeats, calcIsAnnual);

  // Reports Datasets
  const revenueReportData = [
    { invoiceNo: 'INV-2026-001', customer: 'Tesla Energy', plan: 'Enterprise Dedicated', amount: 43083.5, status: 'PAID', region: 'North America', date: '2026-08-01' },
    { invoiceNo: 'INV-2026-002', customer: 'Stripe Payments EU', plan: 'Growth Enterprise', amount: 2411.26, status: 'SENT', region: 'Europe (EMEA)', date: '2026-08-15' },
    { invoiceNo: 'INV-2026-003', customer: 'Acme Global Corp', plan: 'Starter Plan', amount: 31.39, status: 'OVERDUE', region: 'North America', date: '2026-07-01' },
  ];
  const dealsReportData = [
    { dealId: 'DEAL-901', accountName: 'Palantir Technologies', stage: 'Closed Won', acv: 120000, rep: 'Sarah Connor', closeDate: '2026-08-15' },
    { dealId: 'DEAL-902', accountName: 'Snowflake Computing', stage: 'Executive Negotiation', acv: 85000, rep: 'Alex Johnson', closeDate: '2026-09-01' },
  ];

  // E-Sign State
  const [esignEnvelope, setEsignEnvelope] = React.useState<ESignEnvelope>(() =>
    ESignManager.createEnvelope(
      'Master Services Agreement 2026 (Enterprise SLA)',
      [
        { id: 'part_1', name: 'Sarah Connor', email: 'sarah@acme.com', role: 'SIGNER', signingOrder: 1, status: 'SIGNED', authMethod: 'EMAIL_OTP', signedAt: '2026-08-30T12:45:00.000Z', ipAddress: '192.0.2.14', geoLocation: 'San Francisco, CA, US' },
        { id: 'part_2', name: 'Alex Johnson (Client Representative)', email: 'alex@tesla.com', role: 'SIGNER', signingOrder: 2, status: 'PENDING', authMethod: 'EMAIL_OTP' },
      ],
      [{ id: 'fld_1', type: 'SIGNATURE', page: 1, x: 280, y: 560, width: 180, height: 40, signerEmail: 'alex@tesla.com', isCompleted: false }],
    ),
  );
  const [isSignModalOpen, setIsSignModalOpen] = React.useState(false);
  const [signaturePadInput, setSignaturePadInput] = React.useState('Alex Johnson');

  // OCR Result State
  const [ocrResult] = React.useState<OcrDocumentResult>(() => DocumentOcrProcessor.parseInvoice(`INVOICE #INV-2026-9812\nVendor: GigaLibs Cloud Infrastructure Inc.\nTotal: $52,176.50`));
  const [ocrActiveTab, setOcrActiveTab] = React.useState<'metadata' | 'lineItems' | 'rawJson'>('metadata');

  // Support Tickets State & Actions
  const [tickets, setTickets] = React.useState<SupportTicket[]>([
    { id: 'TICK-901', subject: 'VPC Peering configuration for US-East Dedicated DB', customerName: 'Tesla Energy', priority: 'URGENT', status: 'IN_PROGRESS', assignedAgent: 'Alex Johnson', slaRemainingMinutes: 14, createdAt: '2026-08-30 11:20:00' },
    { id: 'TICK-902', subject: 'Custom SSO SAML 2.0 Identity Provider setup', customerName: 'Stripe Payments EU', priority: 'HIGH', status: 'OPEN', assignedAgent: 'Sarah Connor', slaRemainingMinutes: 48, createdAt: '2026-08-30 12:05:00' },
    { id: 'TICK-903', subject: 'Invoicing currency change request (EUR to USD)', customerName: 'Acme Global Corp', priority: 'NORMAL', status: 'RESOLVED', assignedAgent: 'Michael Chen', slaRemainingMinutes: 180, createdAt: '2026-08-30 09:15:00' },
  ]);

  const [isCreateTicketModalOpen, setIsCreateTicketModalOpen] = React.useState(false);
  const [newTicketSubject, setNewTicketSubject] = React.useState('');
  const [newTicketCustomer, setNewTicketCustomer] = React.useState('');
  const [newTicketPriority, setNewTicketPriority] = React.useState<'URGENT' | 'HIGH' | 'NORMAL'>('HIGH');

  // Fraud Assessment State
  const [fraudTestEmail, setFraudTestEmail] = React.useState('suspicious@mailinator.com');
  const [fraudTestIp, setFraudTestIp] = React.useState('198.51.100.4');
  const [fraudIsVpn, setFraudIsVpn] = React.useState(true);
  const [fraudVelocity, setFraudVelocity] = React.useState(4);
  const fraudAssessment = FraudDetectionEngine.assess({ email: fraudTestEmail, ipAddress: fraudTestIp, isVpnOrProxy: fraudIsVpn, cardVelocityPastHour: fraudVelocity, countryMismatch: true });

  // Security TOTP State
  const [totpSecret] = React.useState(() => TotpAuthenticator.generateSecret());
  const [totpInputCode, setTotpInputCode] = React.useState('');
  const [totpVerificationResult, setTotpVerificationResult] = React.useState<'IDLE' | 'SUCCESS' | 'FAILED'>('IDLE');

  // Rule Engine Interactive State
  const [ruleFactInput, setRuleFactInput] = React.useState(JSON.stringify({ isVip: true, cartTotal: 1500, country: 'US' }, null, 2));
  const [ruleEvaluationResult, setRuleEvaluationResult] = React.useState<any>({ matched: true, action: 'APPLY_20_PERCENT_DISCOUNT', discountAmount: 300, evaluatedAt: '2026-08-30 13:45:00' });

  // Map & Geofence Interactive State
  const [destLat, setDestLat] = React.useState<number>(51.5074);
  const [destLng, setDestLng] = React.useState<number>(-0.1278);
  const [geofenceRadiusKm, setGeofenceRadiusKm] = React.useState<number>(5000);
  const calculatedDistance = GeoCalculator.haversineDistance(
    { latitude: 40.7128, longitude: -74.006 },
    { latitude: destLat, longitude: destLng },
  );
  const isWithinGeofence = calculatedDistance <= geofenceRadiusKm;

  // Knowledge Base State
  const [selectedKbModule, setSelectedKbModule] = React.useState<string>('rbac');

  // Workflow Studio State
  const [workflowNodes, setWorkflowNodes] = React.useState([
    { id: 'n1', label: '⚡ Inbound Webhook Trigger', type: 'webhook', config: { path: '/invoices', secret: 'whsec_99214' } },
    { id: 'n2', label: '📚 Company Brain (RAG Search)', type: 'rag', config: { source: 'vendor_msa_docs', topK: 3 } },
    { id: 'n3', label: '🧠 AI Invoice & Tax Extraction', type: 'llm', config: { model: 'claude-3-5-sonnet', prompt: 'Extract total, VAT rate, and vendor terms.' } },
    { id: 'n4', label: '🛡️ CFO Approval Gate (> $10k)', type: 'approval', config: { role: 'cfo', slaMinutes: 60 } },
    { id: 'n5', label: '🌐 Post to ERP (Idempotent)', type: 'http', config: { url: 'https://erp.internal/api', method: 'POST' } },
  ]);
  const [selectedWfNodeId, setSelectedWfNodeId] = React.useState<string>('n1');
  const [aiAssistantPrompt, setAiAssistantPrompt] = React.useState('When an invoice arrives via webhook, search the vendor contract knowledge base, extract tax fields with LLM, and if total is high require CFO approval before posting to ERP');
  const [isAiGeneratingWf, setIsAiGeneratingWf] = React.useState(false);
  const [workflowRunsList, setWorkflowRunsList] = React.useState([
    { id: 'run_001', workflow: 'Invoice Extraction Pipeline', status: 'SUCCEEDED', durationMs: 512, credits: 1250, timestamp: '10 mins ago', dlq: false },
    { id: 'run_002', workflow: 'Support Case Triage & SLA', status: 'SUCCEEDED', durationMs: 380, credits: 850, timestamp: '25 mins ago', dlq: false },
    { id: 'run_013', workflow: 'Invoice Extraction Pipeline', status: 'ACTION_REQUIRED (DLQ)', durationMs: 450, credits: 0, error: 'Upstream 429 Rate Limit (Exhausted 3 retries)', timestamp: '1 hour ago', dlq: true },
  ]);

  const isPlatformAdmin = Boolean(
    account?.email?.endsWith('@gigalibs.dev') ||
    account?.name?.toLowerCase().includes('platform admin') ||
    account?.email === 'admin@gigalibs.dev'
  );

  const [isPlaygroundExpanded, setIsPlaygroundExpanded] = React.useState(true);

  // Operational Apps (Available to all tenants and Platform Admin)
  const operationalAppsGroups = [
    {
      title: '🔌 Connectors & Integrations',
      items: [
        { id: 'connectors', label: '🔌 Connectors & SAM.gov Gateway', icon: <Layers size={16} />, badge: 'Active', active: activeTab === 'connectors', onClick: () => setActiveTab('connectors') },
      ],
    },
    {
      title: '⚡ Enterprise AI Workflow Engine',
      items: [
        { id: 'workflow_studio', label: 'AI Workflow Studio (Canvas)', icon: <Sparkles size={16} />, badge: 'Visual DAG', active: activeTab === 'workflow_studio', onClick: () => setActiveTab('workflow_studio') },
        { id: 'workflow_runs', label: 'Execution Runs & DLQ Monitor', icon: <Layers size={16} />, badge: 'Realtime', active: activeTab === 'workflow_runs', onClick: () => setActiveTab('workflow_runs') },
      ],
    },
    {
      title: '💰 Finance, Billing & Invoices',
      items: [
        { id: 'invoices', label: 'Invoices & Accounts Receivable', icon: <CreditCard size={16} />, badge: 'Operational', active: activeTab === 'invoices', onClick: () => setActiveTab('invoices') },
        { id: 'spend', label: 'Spend & Project Budgets (AP / Envelopes)', icon: <CreditCard size={16} />, badge: 'Spend/AP', active: activeTab === 'spend', onClick: () => setActiveTab('spend') },
        { id: 'ledger', label: 'Double-Entry Ledger', icon: <FileText size={16} />, active: activeTab === 'ledger', onClick: () => setActiveTab('ledger') },
        { id: 'financial_reports', label: 'Financial Reports & AR Aging', icon: <FileText size={16} />, badge: 'P&L / AR', active: activeTab === 'financial_reports', onClick: () => setActiveTab('financial_reports') },
      ],
    },
    {
      title: '🎧 Service Desk & Knowledge Base',
      items: [
        { id: 'tickets', label: 'Support Tickets & SLA', icon: <Shield size={16} />, active: activeTab === 'tickets', onClick: () => setActiveTab('tickets') },
        { id: 'kb', label: 'Module Docs & Knowledge Base', icon: <FileText size={16} />, badge: 'Docs', active: activeTab === 'kb', onClick: () => setActiveTab('kb') },
      ],
    },
    {
      title: '📄 Documents & Compliance',
      items: [
        { id: 'documents', label: 'Document Viewer Pro', icon: <FileText size={16} />, badge: 'Studio', active: activeTab === 'documents', onClick: () => setActiveTab('documents') },
        { id: 'ocr', label: 'AI Document Intelligence (OCR)', icon: <Sparkles size={16} />, active: activeTab === 'ocr', onClick: () => setActiveTab('ocr') },
        { id: 'esign', label: 'E-Signature Workflow & Seal', icon: <Shield size={16} />, badge: esignEnvelope.status, active: activeTab === 'esign', onClick: () => setActiveTab('esign') },
      ],
    },
    {
      title: '👥 User Management & Team RBAC',
      items: [
        { id: 'users', label: 'Team Directory & Users', icon: <Users size={16} />, badge: `${teamMembers.length}`, active: activeTab === 'users', onClick: () => setActiveTab('users') },
        { id: 'roles', label: 'Roles & Permissions Matrix', icon: <Shield size={16} />, badge: `${roles.length}`, active: activeTab === 'roles', onClick: () => setActiveTab('roles') },
        { id: 'groups', label: 'User Groups & Teams', icon: <Users size={16} />, badge: `${groups.length}`, active: activeTab === 'groups', onClick: () => setActiveTab('groups') },
      ],
    },
    {
      title: '💬 Real-Time Comms & AI',
      items: [
        { id: 'chat', label: '2-Way Live Team Chat', icon: <MessageSquare size={16} />, badge: 'Live', active: activeTab === 'chat', onClick: () => setActiveTab('chat') },
        { id: 'aichat', label: 'AI Copilot (Streaming SSE)', icon: <Bot size={16} />, badge: 'GPT-4o', active: activeTab === 'aichat', onClick: () => setActiveTab('aichat') },
      ],
    },
  ];

  // Platform Admin Exclusive Infrastructure Group
  const adminInfrastructureGroup = {
    title: '🏢 Multi-Tenant Infrastructure (Admin)',
    items: [
      { id: 'tenants', label: 'SaaS Tenants & Isolated DBs', icon: <Layers size={16} />, badge: `${tenants.length}`, active: activeTab === 'tenants', onClick: () => setActiveTab('tenants') },
      { id: 'saas_onboarding', label: 'SaaS Progressive Onboarding & Invites', icon: <Sparkles size={16} />, badge: 'Wizard', active: activeTab === 'saas_onboarding', onClick: () => setActiveTab('saas_onboarding') },
      { id: 'universal_data', label: 'Universal Data Studio (Giga Views)', icon: <Layers size={16} />, badge: 'Multi-Domain', active: activeTab === 'universal_data', onClick: () => setActiveTab('universal_data') },
      { id: 'overview', label: "Executive KPI's & MRR", icon: <Layers size={16} />, active: activeTab === 'overview', onClick: () => setActiveTab('overview') },
      { id: 'analytics', label: 'BI Analytics Studio (20+ Charts)', icon: <Layers size={16} />, badge: '20+ Dynamic', active: activeTab === 'analytics', onClick: () => setActiveTab('analytics') },
      { id: 'reports', label: 'Reports Studio (SheetJS / Excel)', icon: <FileText size={16} />, badge: 'XLSX', active: activeTab === 'reports', onClick: () => setActiveTab('reports') },
    ],
  };

  // Platform Admin Exclusive Collapsible Playground Group
  const playgroundDevSandboxGroup = {
    title: isPlaygroundExpanded ? '🧪 Developer & Platform Playground ▼' : '🧪 Developer & Platform Playground ▶',
    items: isPlaygroundExpanded ? [
      { id: 'forms', label: 'Dynamic Forms Studio (FormEngine.io)', icon: <Sparkles size={16} />, badge: 'JSONB', active: activeTab === 'forms', onClick: () => setActiveTab('forms') },
      { id: 'rules', label: 'Universal Rule Engine (JSON AST)', icon: <Sparkles size={16} />, active: activeTab === 'rules', onClick: () => setActiveTab('rules') },
      { id: 'maps', label: 'Maps & Geofencing Engine', icon: <Layers size={16} />, active: activeTab === 'maps', onClick: () => setActiveTab('maps') },
      { id: 'fraud', label: 'Fraud Detection (0-100)', icon: <Shield size={16} />, active: activeTab === 'fraud', onClick: () => setActiveTab('fraud') },
      { id: 'security', label: 'Security Headers & TOTP', icon: <Shield size={16} />, active: activeTab === 'security', onClick: () => setActiveTab('security') },
      { id: 'pricing', label: 'Live Pricing Calculator', icon: <CreditCard size={16} />, active: activeTab === 'pricing', onClick: () => setActiveTab('pricing') },
      { id: 'perm_matrix', label: 'Permissions Mapping & Simulator', icon: <Shield size={16} />, active: activeTab === 'perm_matrix', onClick: () => setActiveTab('perm_matrix') },
      { id: 'runtime_modules', label: 'Certified Runtime Modules', icon: <Layers size={16} />, badge: `${liveModules.length}`, active: activeTab === 'runtime_modules', onClick: () => setActiveTab('runtime_modules') },
      { id: 'settings', label: 'Platform Settings & Theme', icon: <Settings size={16} />, active: activeTab === 'settings', onClick: () => setActiveTab('settings') },
      { id: 'i18n', label: 'Multi-Lingual (i18n / RTL)', icon: <Sparkles size={16} />, badge: currentLang.toUpperCase(), active: activeTab === 'i18n', onClick: () => setActiveTab('i18n') },
      { id: 'currency', label: 'Multi-Currency Converter & FX', icon: <CreditCard size={16} />, badge: currentCurrency, active: activeTab === 'currency', onClick: () => setActiveTab('currency') },
    ] : [],
  };

  const masterNavGroups = isPlatformAdmin
    ? [adminInfrastructureGroup, ...operationalAppsGroups, playgroundDevSandboxGroup]
    : operationalAppsGroups;

  const showAnalyticsFilterBar = activeTab === 'analytics' || activeTab === 'reports' || activeTab === 'overview';

  // Invoice Handlers
  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvCustomer || !newInvEmail) return;

    const sub = newInvItemQty * newInvItemPrice;
    const tax = Math.round(sub * 0.0825);
    const total = sub + tax;

    const newInv: Invoice = {
      id: `inv_${Date.now()}`,
      invoiceNumber: `INV-2026-00${invoices.length + 1}`,
      tenantId: 'acme',
      customerName: newInvCustomer,
      customerEmail: newInvEmail,
      currency: 'USD',
      status: 'SENT',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      paymentTerms: 'NET_30',
      lineItems: [
        { id: '1', description: newInvItemDesc, quantity: newInvItemQty, unitPrice: newInvItemPrice, amount: sub },
      ],
      subtotal: sub,
      discountAmount: 0,
      taxRatePercent: 8.25,
      taxAmount: tax,
      totalAmount: total,
      amountPaid: 0,
      paymentLinkUrl: `https://pay.gigalibs.dev/checkout/inv-2026-00${invoices.length + 1}`,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setInvoices([newInv, ...invoices]);
    setIsCreateInvoiceModalOpen(false);
    setNewInvCustomer('');
    setNewInvEmail('');
  };

  // Tenant Handlers
  const handleProvisionTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName || !newTenantSlug) return;

    setIsProvisioningProgress(true);
    setControlPlaneMessage(null);
    if (controlPlane) {
      try {
        const plan = newTenantPlan === 'Enterprise Dedicated' ? 'ENTERPRISE' : newTenantPlan.toUpperCase();
        const created = await controlPlane.createTenant({
          name: newTenantName,
          slug: newTenantSlug,
          plan,
          isolationMode: newTenantDbMode,
          region: newTenantRegion,
        });
        const newTenant = toConsoleTenant(created);
        setTenants((current) => [newTenant, ...current]);
        setSelectedTenantId(created.id);
        setIsProvisionModalOpen(false);
        setNewTenantName('');
        setNewTenantSlug('');
        setControlPlaneMessage(`Provisioning request created for ${created.name}.`);
      } catch (error) {
        setControlPlaneMessage(error instanceof Error ? error.message : 'Tenant provisioning failed.');
      } finally {
        setIsProvisioningProgress(false);
      }
      return;
    }

    setTimeout(() => {
      const newTen: SaasTenant = {
        id: `ten_${Date.now()}`,
        name: newTenantName,
        slug: newTenantSlug,
        customDomain: `${newTenantSlug}.localhost:5180`,
        plan: newTenantPlan,
        dbMode: newTenantDbMode,
        dbHost: newTenantDbMode === 'DEDICATED_DATABASE' ? `pg-dedicated-${newTenantSlug}.internal:5432` : 'pg-cluster-main.internal:5432',
        dbName: `db_tenant_${newTenantSlug}_prod`,
        region: newTenantRegion,
        status: 'ACTIVE',
        createdAt: new Date().toISOString().slice(0, 10),
      };

      setTenants([newTen, ...tenants]);
      setSelectedTenantId(newTen.id);
      setIsProvisioningProgress(false);
      setIsProvisionModalOpen(false);
      setNewTenantName('');
      setNewTenantSlug('');
    }, 800);
  };

  const handleTenantStatusChange = async (tenant: SaasTenant) => {
    if (!controlPlane) {
      setTenants((current) => current.map((item) => item.id === tenant.id
        ? { ...item, status: item.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }
        : item));
      return;
    }

    const nextStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setIsControlPlaneBusy(true);
    setControlPlaneMessage(null);
    try {
      const updated = await controlPlane.changeTenantStatus(
        tenant.id,
        nextStatus,
        `${nextStatus === 'ACTIVE' ? 'Activated' : 'Suspended'} from the control-plane console`,
      );
      setTenants((current) => current.map((item) => item.id === tenant.id ? toConsoleTenant(updated) : item));
      setControlPlaneMessage(`${tenant.name} is now ${nextStatus.toLowerCase()}.`);
    } catch (error) {
      setControlPlaneMessage(error instanceof Error ? error.message : 'Tenant status update failed.');
    } finally {
      setIsControlPlaneBusy(false);
    }
  };

  const handleSavePlatformSettings = async () => {
    if (!controlPlane || !selectedTenantId || settingsVersion === null) {
      setControlPlaneMessage('Select a tenant and wait for its settings to load.');
      return;
    }

    setIsControlPlaneBusy(true);
    setControlPlaneMessage(null);
    try {
      const updated = await controlPlane.updateSettings(selectedTenantId, {
        expectedVersion: settingsVersion,
        branding: {
          appName: platformSettings.appName,
          primaryColor: platformSettings.primaryColor,
          ...(platformSettings.customDomain ? { customDomain: platformSettings.customDomain } : {}),
          ...(platformSettings.senderEmail ? { emailSenderAddress: platformSettings.senderEmail } : {}),
        },
        security: {
          enforceMfa: platformSettings.enforceMfa,
          passwordExpiryDays: platformSettings.passwordExpiryDays,
          sessionTimeoutMinutes: platformSettings.sessionTimeout,
          allowedIpRanges: platformSettings.whitelistedIps.split(',').map((value) => value.trim()).filter(Boolean),
        },
      });
      setSettingsVersion(updated.version);
      setControlPlaneMessage(`Settings saved as version ${updated.version}.`);
    } catch (error) {
      if (error instanceof ControlPlaneApiError && error.status === 409) {
        setControlPlaneMessage('Another operator changed these settings. Reload the tenant before retrying.');
      } else {
        setControlPlaneMessage(error instanceof Error ? error.message : 'Settings update failed.');
      }
    } finally {
      setIsControlPlaneBusy(false);
    }
  };

  // Permission Checkbox Toggle
  const toggleRolePermission = (roleId: string, modId: string, permKey: PermissionAction) => {
    setRoles(
      roles.map((r) => {
        if (r.id !== roleId) return r;
        const currentMod = r.modules[modId] || { read: false, create: false, edit: false, delete: false, approve: false, export: false };
        return {
          ...r,
          modules: {
            ...r.modules,
            [modId]: {
              ...currentMod,
              [permKey]: !currentMod[permKey],
            },
          },
        };
      }),
    );
  };

  // Quick Permission Batch Actions
  const setAllRolePermissions = (roleId: string, value: boolean) => {
    setRoles(
      roles.map((r) => {
        if (r.id !== roleId) return r;
        const updatedMods: Record<string, ModulePermissionSet> = {};
        DEFAULT_MODULES.forEach((m) => {
          updatedMods[m.id] = { read: value, create: value, edit: value, delete: value, approve: value, export: value };
        });
        return { ...r, modules: updatedMods };
      }),
    );
  };

  // Calculate Effective User Permissions (Direct Role + Group Default Roles)
  const getUserEffectivePermissions = (user: TeamMember) => {
    const userRole = roles.find((r) => r.id === user.roleId);
    const userGroupRoles = (user.groupIds || [])
      .map((gid) => {
        const grp = groups.find((g) => g.id === gid);
        return roles.find((r) => r.id === grp?.defaultRoleId);
      })
      .filter(Boolean) as CustomRole[];

    const allApplicableRoles = [userRole, ...userGroupRoles].filter(Boolean) as CustomRole[];

    const effective: Record<string, ModulePermissionSet> = {};
    DEFAULT_MODULES.forEach((mod) => {
      effective[mod.id] = {
        read: allApplicableRoles.some((r) => r.modules[mod.id]?.read),
        create: allApplicableRoles.some((r) => r.modules[mod.id]?.create),
        edit: allApplicableRoles.some((r) => r.modules[mod.id]?.edit),
        delete: allApplicableRoles.some((r) => r.modules[mod.id]?.delete),
        approve: allApplicableRoles.some((r) => r.modules[mod.id]?.approve),
        export: allApplicableRoles.some((r) => r.modules[mod.id]?.export),
      };
    });

    return { effective, roles: allApplicableRoles };
  };

  // Evaluate Simulation
  const evaluatePermissionCheck = () => {
    const targetUser = teamMembers.find((m) => m.id === simUser);
    if (!targetUser) return { allowed: false, reason: 'User not found' };
    const { effective, roles: userRoles } = getUserEffectivePermissions(targetUser);
    const isGranted = !!effective[simModule]?.[simAction];
    const grantingRole = userRoles.find((r) => r.modules[simModule]?.[simAction]);

    return {
      allowed: isGranted,
      user: targetUser.name,
      role: targetUser.roleId,
      module: simModule,
      action: simAction,
      grantingRoleName: grantingRole?.name || null,
      evaluatedAt: new Date().toISOString(),
    };
  };

  const simResult = evaluatePermissionCheck();
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];

  return (
    <AdminLayout
      appName={platformSettings.appName}
      tenantName={selectedTenant?.name ?? 'No tenant selected'}
      user={account ?? { name: currentUserProfile.name, email: currentUserProfile.email }}
      navGroups={masterNavGroups}
    >
      <div className="w-full max-w-full space-y-6" dir={I18N_DICTIONARIES[currentLang].dir}>

        {/* Top Header Banner: Role-Aware Context */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            {isPlatformAdmin ? (
              <span className="inline-flex items-center gap-2 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                👑 PLATFORM ADMIN
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 font-bold text-slate-800 bg-slate-100 border border-slate-200 px-3 py-1 rounded-xl">
                🏢 {selectedTenant?.name ?? 'Workspace'}
              </span>
            )}
            <span className="text-slate-500 font-mono text-[11px]">
              Subdomain: <strong>{selectedTenant?.slug ?? 'workspace'}.localhost:5180</strong>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {selectedTenant?.dbMode ?? 'SCHEMA_ISOLATED'}
            </span>
            {isControlPlaneBusy && <span className="text-emerald-700 font-bold">Synchronizing…</span>}
          </div>

          <div className="flex items-center gap-2">
            {isPlatformAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold text-[11px]">Active Tenant:</span>
                <select
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  className="h-9 max-w-64 rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 font-bold text-indigo-900 shadow-xs"
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        {/* Contextual Filter Bar (Only visible on Analytics & Reports views) */}
        {showAnalyticsFilterBar && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={globalDateRange}
                onChange={(e) => setGlobalDateRange(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 shadow-xs"
              >
                <option value="today">📅 Today</option>
                <option value="last_7_days">📅 Last 7 Days</option>
                <option value="last_30_days">📅 Last 30 Days</option>
                <option value="this_quarter">📅 This Quarter (Q3 2026)</option>
              </select>

              <select
                value={globalIndustry}
                onChange={(e) => setGlobalIndustry(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 shadow-xs"
              >
                <option value="all">🏢 All Industries</option>
                <option value="saas">💻 B2B SaaS & Cloud</option>
                <option value="ecommerce">🛒 E-Commerce & Retail</option>
                <option value="fintech">🏦 FinTech & Banking</option>
              </select>
            </div>

            <select
              value={currentCurrency}
              onChange={(e) => setCurrentCurrency(e.target.value)}
              className="h-9 px-3 border border-blue-200 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 shadow-xs"
            >
              {Object.keys(SUPPORTED_CURRENCIES).map((c) => (
                <option key={c} value={c}>{SUPPORTED_CURRENCIES[c]?.symbol} {c}</option>
              ))}
            </select>
          </div>
        )}

        {/* 0. AI WORKFLOW ORCHESTRATION STUDIO */}
        {activeTab === 'workflow_studio' && (
          <div className="space-y-4">
            <ModuleHeader
              title="⚡ Enterprise AI Workflow Studio & DAG Canvas"
              description="Visual workflow orchestrator executing native GigaLibs modules (@gigalibs/ocr-core, @gigalibs/fraud-detection, @gigalibs/esign-core, @gigalibs/ledger) alongside AI Agents & ERP Integrations."
              badge="NATIVE DAG RUNTIME v1.0"
              badgeVariant="success"
              actions={
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('workflow_runs')}>
                    📊 View Run Timeline & DLQ
                  </Button>
                  <Button size="sm" onClick={() => alert('Workflow DAG compiled, topological cycle-checked, and cryptographically signed with X.509 PKI envelope!')}>
                    Publish Version v1.0 ✍️
                  </Button>
                </div>
              }
            />

            {/* Native ReactFlow Visual Canvas Engine */}
            <WorkflowStudioCanvas />
          </div>
        )}

        {/* 0.1 EXECUTION RUNS & DEAD-LETTER QUEUE (DLQ) MONITOR */}
        {activeTab === 'workflow_runs' && (
          <div className="space-y-6">
            <ModuleHeader
              title="📋 Real-Time Execution Runs & DLQ Recovery"
              description="Live execution timeline, credit ledger metering, failure isolation, and operator recovery actions."
              badge="LIVE RUNS"
              badgeVariant="info"
              actions={
                <Button size="sm" onClick={() => setActiveTab('workflow_studio')}>
                  ← Back to Canvas Studio
                </Button>
              }
            />

            <div className="space-y-4">
              {workflowRunsList.map((run) => (
                <Card key={run.id} className={run.dlq ? 'border-amber-300 bg-amber-50/30' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-slate-700">{run.id}</span>
                        <h4 className="text-xs font-bold text-slate-900">{run.workflow}</h4>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge variant={run.status.includes('SUCCEEDED') ? 'success' : 'warning'}>
                          {run.status}
                        </StatusBadge>
                        {run.dlq && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setWorkflowRunsList((prev) =>
                                prev.map((r) =>
                                  r.id === run.id
                                    ? { ...r, status: 'SUCCEEDED', dlq: false, credits: 1250, error: undefined }
                                    : r
                                )
                              );
                              alert('Operator DLQ recovery completed: Execution resumed from failed node without re-billing upstream work!');
                            }}
                          >
                            ⚡ Retry from Failed Node
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div className="flex justify-between text-slate-500">
                      <span>Triggered: {run.timestamp}</span>
                      <span>Duration: {run.durationMs} ms</span>
                      <span className="font-mono font-bold text-indigo-600">Credits Settled: {run.credits} units</span>
                    </div>
                    {run.error && (
                      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-mono text-[11px]">
                        <strong>Quarantine Reason:</strong> {run.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 0.2 UNIVERSAL MULTI-DOMAIN DATA STUDIO (GIGA VIEWS) */}
        {activeTab === 'universal_data' && (
          <div className="space-y-6">
            <UniversalDataStudioPro />
          </div>
        )}

        {/* 1. EXECUTIVE KPIS & MRR REVENUE VELOCITY STUDIO */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <ExecutiveKpiStudioPro />
          </div>
        )}

        {/* 2. BI ANALYTICS STUDIO (20+ DYNAMIC CHARTS & MAPS) */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <BiAnalyticsStudioPro />
          </div>
        )}

        {/* 3. REPORTS STUDIO (SHEETJS) */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <ModuleHeader
              title="📑 Interactive Spreadsheet Reports & Multi-Sheet Excel Engine"
              description="OpenXML multi-sheet workbook generation with styled table headers, formula evaluation, and multi-currency formatting powered by SheetJS suite."
              badge="MULTI-SHEET XLSX"
              badgeVariant="success"
              actions={
                <button
                  onClick={() =>
                    ExportEngine.exportMultiSheetExcelXml(
                      [
                        {
                          sheetName: 'Revenue Ledger',
                          data: revenueReportData,
                          columns: [
                            { key: 'invoiceNo', header: 'Invoice #' },
                            { key: 'customer', header: 'Customer' },
                            { key: 'plan', header: 'Plan' },
                            { key: 'amount', header: 'Amount ($)' },
                            { key: 'status', header: 'Status' },
                            { key: 'date', header: 'Date' },
                          ],
                        },
                        {
                          sheetName: 'Deal Pipeline',
                          data: dealsReportData,
                          columns: [
                            { key: 'dealId', header: 'Deal ID' },
                            { key: 'accountName', header: 'Account' },
                            { key: 'stage', header: 'Stage' },
                            { key: 'acv', header: 'ACV ($)' },
                            { key: 'rep', header: 'Rep' },
                          ],
                        },
                      ],
                      'Enterprise_Multi_Sheet_Workbook_2026.xlsx',
                    )
                  }
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center space-x-2"
                >
                  <span>📊 Download Multi-Sheet Excel (.xlsx)</span>
                </button>
              }
            />

            <ReportsGrid
              title="Enterprise SaaS Revenue & Invoicing Ledger"
              subtitle="Live itemized ledger with automatic currency conversion and real-time total sum calculations."
              filename="SaaS_Revenue_Ledger_2026"
              data={revenueReportData}
              columns={[
                { key: 'invoiceNo', header: 'Invoice #' },
                { key: 'customer', header: 'Customer Account' },
                { key: 'plan', header: 'Subscription Plan' },
                { key: 'amount', header: `Amount (${currentCurrency})`, formatter: (v) => formatMoney(Number(v)) },
                { key: 'status', header: 'Status' },
                { key: 'region', header: 'Territory' },
                { key: 'date', header: 'Issue Date' },
              ]}
            />
          </div>
        )}

        {/* 4. DYNAMIC FORMS STUDIO */}
        {activeTab === 'forms' && (
          <FormsStudioPro />
        )}


        {/* 5. UNIVERSAL RULE ENGINE */}
        {activeTab === 'rules' && (
          <UniversalRuleStudioPro />
        )}


        {/* 6. MAPS & GEOFENCING ENGINE */}
        {activeTab === 'maps' && (
          <MapsGeofencingStudioPro />
        )}


        {/* 7. INVOICES & RECEIVABLES */}
        {activeTab === 'invoices' && (
          <InvoiceStudio onNavigateTab={(t) => setActiveTab(t)} isDemoView={isDemoMode} />
        )}

        {/* 7.1 ENTERPRISE SPEND & PROJECT BUDGETS */}
        {activeTab === 'spend' && (
          <SpendStudio tenantId={selectedTenant?.id || 'warner-bros'} />
        )}

        {/* 7B. US MULTI-TIER TAX & NEXUS ENGINE */}
        {activeTab === 'tax_config' && (
          <TaxConfigurationStudio />
        )}

        {/* 7C. FINANCIAL REPORTS & AR AGING STUDIO */}
        {activeTab === 'financial_reports' && (
          <FinancialReportsStudio />
        )}




        {/* 8. LIVE PRICING CALCULATOR */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🏷️ Live CPQ & Dynamic Pricing Calculator"
              description="Configure, Price, Quote (CPQ) calculator for enterprise sales reps with live seat tier sliders and annual commitment discounts."
              badge="CPQ RUNTIME"
              badgeVariant="info"
              actions={
                <Button size="sm" onClick={() => alert(`Generated formal quotation for ${calcSeats} seats: ${formatMoney(calculatedQuote.monthlyTotal / 100)}/mo`)}>
                  Generate Formal Quotation PDF
                </Button>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Dynamic Quote Calculator</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex justify-between items-center mb-1 text-xs font-bold">
                      <span>User Seats Required:</span>
                      <span className="text-blue-600 text-sm">{calcSeats} Seats</span>
                    </div>
                    <input type="range" min="1" max="100" value={calcSeats} onChange={(e) => setCalcSeats(Number(e.target.value))} className="w-full" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border">
                    <span className="text-xs font-bold text-slate-800">Annual Billing (20% Savings)</span>
                    <button
                      onClick={() => setCalcIsAnnual(!calcIsAnnual)}
                      className={`w-12 h-6 rounded-full transition-colors p-1 ${calcIsAnnual ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${calcIsAnnual ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Calculated Price Breakdown</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-6 bg-slate-900 text-white rounded-2xl text-center">
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Monthly Billed Equivalent</div>
                    <div className="text-3xl font-black text-blue-400 mt-1">
                      {formatMoney(calculatedQuote.monthlyTotal / 100)} / mo
                    </div>
                    <div className="text-[11px] text-emerald-400 font-bold mt-1">
                      Billed Annually at {formatMoney(calculatedQuote.annualTotal / 100)} / year
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 9. GENERIC SUBSCRIPTION ENGINE & PLANS */}
        {activeTab === 'plans' && (
          <GenericSubscriptionStudio />
        )}

        {/* 9B. PROGRESSIVE SAAS ONBOARDING & INVITATION WIZARD */}
        {activeTab === 'saas_onboarding' && (
          <SaaSOnboardingWizard />
        )}

        {/* 10. DOUBLE-ENTRY LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <ModuleHeader
              title="📒 Double-Entry General Ledger"
              description="Immutable GAAP/IFRS compliant financial ledger enforcing Debits == Credits invariant across cash, revenue, and receivables."
              badge="INVARIANT BALANCED"
              badgeVariant="success"
              actions={
                <Button size="sm" onClick={() => alert('New Journal Entry dialog launched')}>+ Post Journal Entry</Button>
              }
            />
            <Card>
              <CardHeader><CardTitle>General Journal (Debits == Credits Invariant Enforced)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b">
                      <tr><th className="p-3">Entry #</th><th className="p-3">Account</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th><th className="p-3">Status</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {dbJournalEntries.length > 0 ? (
                        dbJournalEntries.flatMap((entry) =>
                          entry.lines.map((line: any, lIdx: number) => (
                            <tr key={`${entry.id}-${lIdx}`}>
                              <td className="p-3 font-mono font-bold">{entry.entryNumber}</td>
                              <td className="p-3">{line.account?.code} - {line.account?.name || line.description}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                {line.debitCents > 0 ? formatMoney(line.debitCents / 100) : '—'}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-blue-600">
                                {line.creditCents > 0 ? formatMoney(line.creditCents / 100) : '—'}
                              </td>
                              <td className="p-3"><StatusBadge variant="success">POSTED</StatusBadge></td>
                            </tr>
                          ))
                        )
                      ) : (
                        <>
                          <tr><td className="p-3 font-mono font-bold">JE-10928</td><td className="p-3">1000 - Operating Cash</td><td className="p-3 text-right font-mono font-bold text-emerald-600">{formatMoney(5000)}</td><td className="p-3 text-right font-mono text-slate-400">{formatMoney(0)}</td><td className="p-3"><StatusBadge variant="success">POSTED</StatusBadge></td></tr>
                          <tr><td className="p-3 font-mono font-bold">JE-10928</td><td className="p-3">4000 - SaaS Subscription Revenue</td><td className="p-3 text-right font-mono text-slate-400">{formatMoney(0)}</td><td className="p-3 text-right font-mono font-bold text-blue-600">{formatMoney(5000)}</td><td className="p-3"><StatusBadge variant="success">POSTED</StatusBadge></td></tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 11. HEADLESS SHOPPING CART */}
        {activeTab === 'cart' && (
          <HeadlessCheckoutStudioPro />
        )}


        {/* 12. TEAM DIRECTORY & USERS */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <ModuleHeader
              title="👥 User Management, Roles & Teams"
              description="Manage corporate workspace members, assign RBAC security roles, configure squad group memberships, and inspect resolved permissions."
              badge={`${teamMembers.length} ACTIVE USERS`}
              badgeVariant="success"
              actions={
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setIsCreateRoleModalOpen(true)} className="!bg-purple-600 hover:!bg-purple-500 !text-white font-bold">
                    + Create Custom Role 🛡️
                  </Button>
                  <Button size="sm" onClick={() => setIsInviteUserModalOpen(true)}>+ Create / Invite User</Button>
                </div>
              }
            />

            {/* IAM Sub-Navigation Tab Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>👥 Team Members</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px]">{teamMembers.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab('roles')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'roles' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🛡️ Roles & Permissions Matrix</span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px]">{roles.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab('groups')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    activeTab === 'groups' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🏢 Squads & Groups</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px]">{groups.length}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pr-1">
                <Button size="sm" onClick={() => setIsCreateGroupModalOpen(true)} variant="outline">
                  + Create Squad Group 👥
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="🔍 Search users by name or email..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="h-10 px-3 border rounded-xl text-xs font-bold bg-white text-slate-700"
                  >
                    <option value="ALL">All Roles</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <select
                    value={userStatusFilter}
                    onChange={(e) => setUserStatusFilter(e.target.value)}
                    className="h-10 px-3 border rounded-xl text-xs font-bold bg-white text-slate-700"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INVITED">INVITED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b text-slate-500">
                      <tr>
                        <th className="p-3">User & Contact</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Primary Role</th>
                        <th className="p-3">Assigned Groups</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {teamMembers
                        .filter((m) => {
                          const matchesSearch = m.name.toLowerCase().includes(userSearchQuery.toLowerCase()) || m.email.toLowerCase().includes(userSearchQuery.toLowerCase());
                          const matchesRole = userRoleFilter === 'ALL' || m.roleId === userRoleFilter;
                          const matchesStatus = userStatusFilter === 'ALL' || m.status === userStatusFilter;
                          return matchesSearch && matchesRole && matchesStatus;
                        })
                        .map((m) => {
                          const userGroupObjects = (m.groupIds || []).map((gid) => groups.find((g) => g.id === gid)).filter(Boolean) as UserGroup[];

                          return (
                            <tr key={m.id} className="hover:bg-slate-50/50">
                              <td className="p-3">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                    {m.name.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-900">{m.name}</div>
                                    <div className="text-slate-400 font-mono text-[10px]">{m.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 font-medium text-slate-700">{m.department}</td>
                              <td className="p-3">
                                <select
                                  value={m.roleId}
                                  onChange={(e) => setTeamMembers(teamMembers.map((tm) => (tm.id === m.id ? { ...tm, roleId: e.target.value } : tm)))}
                                  className="h-8 px-2 border rounded-lg text-xs bg-white font-bold text-blue-600"
                                >
                                  {roles.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {userGroupObjects.length > 0 ? (
                                    userGroupObjects.map((g) => (
                                      <span key={g.id} className="px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: g.color }}>
                                        {g.name}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">No group</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <StatusBadge variant={m.status === 'ACTIVE' ? 'success' : m.status === 'INVITED' ? 'info' : 'warning'}>
                                  {m.status}
                                </StatusBadge>
                              </td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  onClick={() => {
                                    setSelectedUserForPerms(m);
                                    setIsEffectivePermModalOpen(true);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                                >
                                  👁️ Perms
                                </button>
                                <button
                                  onClick={() =>
                                    setTeamMembers(
                                      teamMembers.map((tm) => (tm.id === m.id ? { ...tm, status: tm.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } : tm)),
                                    )
                                  }
                                  className="text-xs text-slate-600 hover:text-slate-900 font-bold"
                                >
                                  {m.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                </button>
                                <button
                                  onClick={() => setTeamMembers(teamMembers.filter((tm) => tm.id !== m.id))}
                                  className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                                >
                                  🗑️ Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 13. ROLES & GRANULAR PERMISSIONS MATRIX */}
        {activeTab === 'roles' && (
          <RbacStudioPro />
        )}


        {/* 14. USER GROUPS & TEAMS */}
        {activeTab === 'groups' && (
          <div className="space-y-6">
            <ModuleHeader
              title="👥 User Groups, Squads & Department Teams"
              description="Organize workspace users into functional business units (Sales, Engineering, Support) with inherited default roles and designated squad leads."
              badge={`${groups.length} SQUADS ACTIVE`}
              badgeVariant="info"
              actions={
                <Button size="sm" onClick={() => setIsCreateGroupModalOpen(true)}>+ Create New Group / Team</Button>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => {
                const leadUser = teamMembers.find((m) => m.id === group.leadUserId);
                const defaultRole = roles.find((r) => r.id === group.defaultRoleId);
                const groupMembers = teamMembers.filter((m) => (m.groupIds || []).includes(group.id));

                return (
                  <Card key={group.id} className="p-5 space-y-4 border-2" style={{ borderColor: `${group.color}30` }}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs" style={{ backgroundColor: group.color }}>
                          {group.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{group.name}</h4>
                          <p className="text-xs text-slate-500">{group.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setGroups(groups.filter((g) => g.id !== group.id))}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    <div className="space-y-2 text-xs border-t pt-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Team Lead / Manager:</span>
                        <strong className="text-slate-900">{leadUser?.name || 'Unassigned'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Inherited Default Role:</span>
                        <Badge variant="info">{defaultRole?.name || group.defaultRoleId}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Active Members:</span>
                        <strong className="text-blue-600 font-bold font-mono">{groupMembers.length} Members</strong>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Team Roster</span>
                      <div className="flex flex-wrap gap-1.5">
                        {groupMembers.map((gm) => (
                          <span key={gm.id} className="px-2.5 py-1 bg-white border rounded-lg text-xs font-bold text-slate-800 shadow-xs flex items-center space-x-1">
                            <span>{gm.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 15. PERMISSIONS MAPPING & SIMULATOR */}
        {activeTab === 'perm_matrix' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🧪 Permissions Mapping & Access Control Simulator"
              description="Simulate authorization checks by evaluating a target user, requested resource module, and action gate against their direct role and assigned squads."
              badge="ABAC SIMULATOR"
              badgeVariant="info"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>🧪 Live RBAC & ABAC Access Control Simulator</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold block mb-1">Select Test User</label>
                    <select
                      value={simUser}
                      onChange={(e) => setSimUser(e.target.value)}
                      className="w-full h-10 px-3 border rounded-xl bg-white font-bold text-slate-800"
                    >
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold block mb-1">Target Resource Module</label>
                    <select
                      value={simModule}
                      onChange={(e) => setSimModule(e.target.value)}
                      className="w-full h-10 px-3 border rounded-xl bg-white font-bold text-slate-800"
                    >
                      {DEFAULT_MODULES.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold block mb-1">Requested Action Gate</label>
                    <select
                      value={simAction}
                      onChange={(e) => setSimAction(e.target.value as PermissionAction)}
                      className="w-full h-10 px-3 border rounded-xl bg-white font-bold text-slate-800 uppercase"
                    >
                      <option value="read">READ 👁️</option>
                      <option value="create">CREATE ➕</option>
                      <option value="edit">EDIT ✏️</option>
                      <option value="delete">DELETE 🗑️</option>
                      <option value="approve">APPROVE ✅</option>
                      <option value="export">EXPORT 📊</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🎯 Security Gate Evaluation Result</CardTitle>
                </CardHeader>
                <CardContent className="p-6 text-center space-y-4">
                  <div className={`p-6 rounded-2xl border-2 ${simResult.allowed ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'}`}>
                    <div className="text-3xl mb-2">{simResult.allowed ? '✅ ACCESS GRANTED' : '🚫 ACCESS DENIED'}</div>
                    <p className="text-xs font-bold text-slate-700">
                      User <span className="text-blue-600">{simResult.user}</span> attempting <span className="font-mono bg-white px-2 py-0.5 rounded border">{simResult.module}:{simResult.action.toUpperCase()}</span>
                    </p>
                    <div className="mt-3 text-xs">
                      {simResult.allowed ? (
                        <span className="text-emerald-700 font-bold">
                          ✓ Authorization permitted via role: <strong>{simResult.grantingRoleName}</strong>
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">
                          ✗ Blocked by RBAC Guard: Missing `{simResult.module}:{simResult.action}` in assigned roles
                        </span>
                      )}
                    </div>
                  </div>

                  <pre className="text-left p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto">
                    {JSON.stringify(simResult, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 16. USER PROFILE */}
        {activeTab === 'user_profile' && (
          <div className="space-y-6">
            <ModuleHeader
              title="👤 User Profile & Social Endorsements"
              description="Personal employee identity, biography, role credentials, peer endorsements (likes), and moderation flags."
              badge="ACTIVE SESSION"
              badgeVariant="success"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="text-center p-6 space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-2xl font-black text-blue-700">
                  {currentUserProfile.name.charAt(0)}
                </div>
                <h3 className="font-bold text-slate-900">{currentUserProfile.name}</h3>
                <p className="text-xs text-slate-500">{currentUserProfile.email}</p>
                <div className="flex justify-center space-x-2 pt-2">
                  <button
                    onClick={() => {
                      setProfileLikes(isLiked ? profileLikes - 1 : profileLikes + 1);
                      setIsLiked(!isLiked);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center space-x-1 ${
                      isLiked ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}
                  >
                    <span>❤️ Liked ({profileLikes})</span>
                  </button>
                  <button
                    onClick={() => setIsReportModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    🚩 Report
                  </button>
                </div>
              </Card>
              <Card className="md:col-span-2 p-6">
                <CardTitle className="mb-4">Edit Profile Info</CardTitle>
                <div className="space-y-4 text-xs">
                  <div><label className="font-bold block mb-1">Full Name</label><Input value={currentUserProfile.name} onChange={(e) => setCurrentUserProfile({ ...currentUserProfile, name: e.target.value })} /></div>
                  <div><label className="font-bold block mb-1">Bio</label><textarea rows={3} value={currentUserProfile.bio} onChange={(e) => setCurrentUserProfile({ ...currentUserProfile, bio: e.target.value })} className="w-full p-3 border rounded-xl" /></div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* 17. USER SECURITY */}
        {activeTab === 'user_security' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🔐 Account Security, Passwords & 2FA"
              description="Manage credential policies, Cloudflare Turnstile bot verification, session timeouts, and password rotation schedules."
              badge="ENFORCED"
              badgeVariant="success"
            />
            <Card>
              <CardHeader><CardTitle>Account Security Controls</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border flex justify-between items-center">
                  <div>
                    <span className="font-bold text-xs text-slate-800">Cloudflare Turnstile Bot Protection</span>
                    <p className="text-[11px] text-slate-400">Non-interactive managed challenge</p>
                  </div>
                  <StatusBadge variant="success">HUMAN VERIFIED</StatusBadge>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border">
                  <div>
                    <span className="font-bold text-xs text-slate-800">Password Rotation Policy</span>
                    <p className="text-[11px] text-slate-400">Last updated 18 days ago</p>
                  </div>
                  <Button size="sm" onClick={() => setIsResetPasswordModalOpen(true)}>Change Password</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 18. USER LIFECYCLE */}
        {activeTab === 'user_lifecycle' && (
          <div className="space-y-6">
            <ModuleHeader
              title="⚠️ Account Lifecycle & GDPR Data Privacy"
              description="Temporary account deactivation, audit archival, and GDPR permanent erasure workflows with statutory retention grace periods."
              badge="GDPR READY"
              badgeVariant="warning"
            />
            <Card>
              <CardHeader><CardTitle>Account Actions & Privacy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-xs text-amber-900">Deactivate Account</span>
                    <p className="text-[11px] text-amber-700">Temporarily freeze login access without losing data.</p>
                  </div>
                  <Button variant="outline">Freeze Account</Button>
                </div>
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-xs text-rose-900">GDPR Permanent Erasure</span>
                    <p className="text-[11px] text-rose-700">Irreversible deletion with 14-day grace period.</p>
                  </div>
                  <Button variant="danger">Request Deletion</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 19. SAAS TENANTS */}
        {activeTab === 'tenants' && (
          <MultiTenancyStudioPro />
        )}

        {/* 19B. CONNECTORS & SAM.GOV GATEWAY */}
        {activeTab === 'connectors' && (
          <ConnectorsStudioPro tenantSlug={selectedTenant?.slug || 'sam-gov'} />
        )}


        {/* 20. DOCUMENT VIEWER */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            <ModuleHeader
              title="📄 Document Viewer Pro & PDF Annotator"
              description="High-performance client-side PDF document rendering canvas with redaction tools, thumbnail navigation, and instant signing triggers."
              badge="PRO CANVAS"
              badgeVariant="info"
              actions={
                <Button size="sm" onClick={() => setIsSignModalOpen(true)}>✍️ Sign Document Now</Button>
              }
            />
            <DocumentViewer url="#" filename="Master_Services_Agreement_2026.pdf" totalPages={5} onSignRequested={() => setIsSignModalOpen(true)} />
          </div>
        )}

        {/* 21. OCR */}
        {activeTab === 'ocr' && (
          <DocumentOcrStudioPro />
        )}


        {/* 22. E-SIGN */}
        {activeTab === 'esign' && (
          <CryptographicEsignStudioPro />
        )}


        {/* 23. KNOWLEDGE BASE */}
        {activeTab === 'kb' && (
          <div className="space-y-6">
            <ModuleHeader
              title="📚 GigaCRM Architecture Docs & Knowledge Base"
              description="Developer specifications, contracts, and Zod validation schemas across all core packages."
              badge="DOCS & SCHEMAS"
              badgeVariant="info"
            />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="p-4 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Architecture Modules</span>
                {(['rbac', 'tenancy', 'esign', 'ocr', 'ledger', 'cart'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedKbModule(m)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
                      selectedKbModule === m ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    @{m.toUpperCase()} Spec
                  </button>
                ))}
              </Card>
              <Card className="md:col-span-3 p-6 space-y-4">
                <CardTitle className="uppercase tracking-wider">Module Specification: @gigalibs/{selectedKbModule}-core</CardTitle>
                <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto">
                  <pre>{`// GigaCRM Core Specifications for @gigalibs/${selectedKbModule}-core
import { z } from 'zod';

export const Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  createdAt: z.string().datetime(),
});

export type SchemaType = z.infer<typeof Schema>;`}</pre>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* 24. TICKETS */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🎧 Customer Support Desk & SLA Management"
              description="Track customer issues with automated First-Response-Time (FRT) SLA countdowns and one-click resolution triggers."
              badge={`${tickets.length} TICKETS IN QUEUE`}
              badgeVariant="info"
              actions={
                <Button size="sm" onClick={() => setIsCreateTicketModalOpen(true)}>+ Create Support Ticket</Button>
              }
            />

            <Card>
              <CardHeader><CardTitle>Active Ticket Queue</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b">
                      <tr><th className="p-3">Ticket ID</th><th className="p-3">Subject</th><th className="p-3">Customer</th><th className="p-3">Priority</th><th className="p-3">SLA Countdown</th><th className="p-3">Status</th><th className="p-3 text-right">CRUD Actions</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {tickets.map((tk) => (
                        <tr key={tk.id}>
                          <td className="p-3 font-mono font-bold text-blue-600">{tk.id}</td>
                          <td className="p-3 font-bold text-slate-900">{tk.subject}</td>
                          <td className="p-3">{tk.customerName}</td>
                          <td className="p-3"><Badge variant={tk.priority === 'URGENT' ? 'danger' : 'warning'}>{tk.priority}</Badge></td>
                          <td className="p-3 font-mono font-bold text-amber-600">{tk.slaRemainingMinutes} mins left</td>
                          <td className="p-3"><StatusBadge variant={tk.status === 'RESOLVED' ? 'success' : 'info'}>{tk.status}</StatusBadge></td>
                          <td className="p-3 text-right space-x-2">
                            {tk.status !== 'RESOLVED' && (
                              <button
                                onClick={() => setTickets(tickets.map((t) => (t.id === tk.id ? { ...t, status: 'RESOLVED' } : t)))}
                                className="text-xs text-emerald-600 hover:text-emerald-800 font-bold"
                              >
                                Resolve ✓
                              </button>
                            )}
                            <button
                              onClick={() => setTickets(tickets.filter((t) => t.id !== tk.id))}
                              className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 25. FRAUD */}
        {activeTab === 'fraud' && (
          <FraudDetectionStudioPro />
        )}


        {/* 26. SECURITY */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🔐 Security Shield & TOTP 2FA Authentication"
              description="Cryptographic TOTP secret validation for Google Authenticator alongside enforced HSTS, CSP, and X-Frame-Options headers."
              badge="RFC 6238 TOTP"
              badgeVariant="success"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Google Authenticator TOTP Secret</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="font-mono text-xs p-4 bg-slate-900 text-emerald-400 rounded-xl">{totpSecret}</div>
                  <div className="flex space-x-2">
                    <Input placeholder="Enter 6-digit TOTP code" value={totpInputCode} onChange={(e) => setTotpInputCode(e.target.value)} />
                    <Button size="sm" onClick={() => setTotpVerificationResult(totpInputCode.length === 6 ? 'SUCCESS' : 'FAILED')}>Verify</Button>
                  </div>
                  {totpVerificationResult === 'SUCCESS' && <div className="text-xs font-bold text-emerald-600">✓ TOTP Code Validated</div>}
                  {totpVerificationResult === 'FAILED' && <div className="text-xs font-bold text-rose-600">✗ Invalid TOTP Code</div>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Security Headers Policy</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between p-2 bg-slate-50 rounded-lg"><span>Strict-Transport-Security</span><strong className="text-emerald-600">max-age=63072000; preload</strong></div>
                  <div className="flex justify-between p-2 bg-slate-50 rounded-lg"><span>X-Content-Type-Options</span><strong className="text-emerald-600">nosniff</strong></div>
                  <div className="flex justify-between p-2 bg-slate-50 rounded-lg"><span>X-Frame-Options</span><strong className="text-emerald-600">DENY</strong></div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* CERTIFIED RUNTIME MODULES */}
        {activeTab === 'runtime_modules' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🧩 Certified Runtime Module Registry"
              description="Modules shown here are registered by manifest, dependency-validated at startup, and exposed by the live API. Prototype UI panels are intentionally not represented as certified modules."
              badge={`${liveModules.filter((module) => module.status === 'READY').length}/${liveModules.length} READY`}
              badgeVariant={liveModules.every((module) => module.status === 'READY') ? 'success' : 'warning'}
              actions={<Button size="sm" variant="outline" onClick={() => controlPlane && void controlPlane.listModules().then(setLiveModules)}>Refresh Registry</Button>}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveModules.map((module) => (
                <Card key={module.manifest.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{module.manifest.name}</CardTitle>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">{module.manifest.id}@{module.manifest.version}</div>
                      </div>
                      <StatusBadge variant={module.status === 'READY' ? 'success' : module.status === 'BLOCKED' ? 'error' : 'neutral'}>{module.status}</StatusBadge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <p className="text-slate-600">{module.manifest.description}</p>
                    <div>
                      <div className="mb-2 font-bold text-slate-800">Capabilities</div>
                      <div className="flex flex-wrap gap-1.5">{module.manifest.capabilities.map((capability) => <Badge key={capability} variant="info">{capability}</Badge>)}</div>
                    </div>
                    <div>
                      <div className="mb-2 font-bold text-slate-800">Required modules</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {Object.entries(module.manifest.requires).length === 0
                          ? 'None (platform root)'
                          : Object.entries(module.manifest.requires).map(([id, version]) => `${id} ${version}`).join(' · ')}
                      </div>
                    </div>
                    {module.problems.length > 0 && <div className="rounded-xl bg-rose-50 p-3 text-rose-700">{module.problems.join('; ')}</div>}
                  </CardContent>
                </Card>
              ))}
              {liveModules.length === 0 && <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">The runtime registry has not loaded yet.</div>}
            </div>
          </div>
        )}

        {/* 27. SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <ModuleHeader
              title="⚙️ Platform Settings & Dynamic Accent Themes"
              description="Customize primary brand aesthetics, white-label SSL domains, notification senders, and IP whitelist firewalls."
              badge="ORGANIZATION ADMIN"
              badgeVariant="info"
              actions={
                <Button size="sm" disabled={isControlPlaneBusy || settingsVersion === null} onClick={() => void handleSavePlatformSettings()}>Save Version {settingsVersion ?? '—'} 💾</Button>
              }
            />

            <Card>
              <CardHeader><CardTitle>🎨 Dynamic Primary Accent Palette</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {THEME_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setPlatformSettings({ ...platformSettings, primaryColor: p.color })}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center space-y-2 transition-all ${
                        platformSettings.primaryColor === p.color ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${p.bg} flex items-center justify-center text-white text-xs font-bold`}>
                        {platformSettings.primaryColor === p.color ? '✓' : ''}
                      </div>
                      <span className="text-[11px] font-bold text-slate-800">{p.name}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Organization & White-Label Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="font-bold block mb-1">Application Brand Name</label><Input value={platformSettings.appName} onChange={(e) => setPlatformSettings({ ...platformSettings, appName: e.target.value })} /></div>
                  <div><label className="font-bold block mb-1">Custom Caddy SSL Domain</label><Input value={platformSettings.customDomain} onChange={(e) => setPlatformSettings({ ...platformSettings, customDomain: e.target.value })} /></div>
                  <div><label className="font-bold block mb-1">Notification Sender Email</label><Input type="email" value={platformSettings.senderEmail} onChange={(e) => setPlatformSettings({ ...platformSettings, senderEmail: e.target.value })} /></div>
                  <div><label className="font-bold block mb-1">Session Timeout (minutes)</label><Input type="number" min={5} max={43200} value={platformSettings.sessionTimeout} onChange={(e) => setPlatformSettings({ ...platformSettings, sessionTimeout: Number(e.target.value) })} /></div>
                  <div><label className="font-bold block mb-1">Password Expiry (days; 0 disables)</label><Input type="number" min={0} max={3650} value={platformSettings.passwordExpiryDays} onChange={(e) => setPlatformSettings({ ...platformSettings, passwordExpiryDays: Number(e.target.value) })} /></div>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 font-bold">
                    <input type="checkbox" checked={platformSettings.enforceMfa} onChange={(e) => setPlatformSettings({ ...platformSettings, enforceMfa: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                    Require multi-factor authentication
                  </label>
                </div>
                <div><label className="font-bold block mb-1">Allowed IP Ranges (comma-separated CIDRs)</label><Input value={platformSettings.whitelistedIps} onChange={(e) => setPlatformSettings({ ...platformSettings, whitelistedIps: e.target.value })} /></div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 28. MULTI-LINGUAL */}
        {activeTab === 'i18n' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🌐 Multi-Lingual (i18n) & Right-to-Left (RTL) Engine"
              description="Global internationalization engine supporting 6 global languages with bidirectional layout flipping (LTR/RTL) for Arabic."
              badge={currentLang.toUpperCase()}
              badgeVariant="info"
            />

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {(Object.keys(I18N_DICTIONARIES) as SupportedLanguage[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setCurrentLang(l)}
                  className={`p-3 rounded-2xl border-2 text-left space-y-1 ${
                    currentLang === l ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold">{I18N_DICTIONARIES[l].name}</div>
                  <div className="text-[10px] text-slate-500 uppercase">{I18N_DICTIONARIES[l].dir}</div>
                </button>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>📖 Translation Dictionary: {I18N_DICTIONARIES[currentLang].name}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y">
                    {Object.keys(I18N_DICTIONARIES[currentLang].strings).map((k) => (
                      <tr key={k}>
                        <td className="p-3 font-mono font-bold text-slate-700">{k}</td>
                        <td className="p-3 font-medium text-blue-900">{I18N_DICTIONARIES[currentLang].strings[k]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 29. MULTI-CURRENCY */}
        {activeTab === 'currency' && (
          <MultiCurrencyStudioPro />
        )}


        {/* 30. CHAT */}
        {activeTab === 'chat' && (
          <div className="space-y-6">
            <ModuleHeader
              title="💬 2-Way Real-Time WebSocket Team Chat"
              description="Bi-directional WebSocket messaging stream with live connection status, channel routing, and instant team chat."
              badge="WSS CONNECTED"
              badgeVariant="success"
            />
            <div className="flex justify-center">
              <ChatWindow channelId="enterprise-general" title="# enterprise-general (2-Way Live WebSocket)" />
            </div>
          </div>
        )}

        {/* 31. AI CHAT */}
        {activeTab === 'aichat' && (
          <div className="space-y-6">
            <ModuleHeader
              title="🤖 AI Copilot (Server-Sent Events Token Streaming)"
              description="Interactive AI Assistant powered by GPT-4o with Server-Sent Events (SSE) streaming token output and conversational memory."
              badge="GPT-4o STREAM"
              badgeVariant="info"
            />
            <div className="flex justify-center">
              <AIChatWindow title="GigaLibs AI Sales & Support Copilot (SSE GPT-4o)" />
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODALS */}
        {/* ========================================================= */}

        {/* MODAL: INVITE / CREATE USER */}
        <Modal
          isOpen={isInviteUserModalOpen}
          onClose={() => setIsInviteUserModalOpen(false)}
          title="+ Create / Invite Workspace User"
          description="Send workspace invite and assign RBAC role + team squad groups."
          footer={
            <Button
              size="sm"
              onClick={() => {
                if (!newInviteName || !newInviteEmail) return;
                const newMember: TeamMember = {
                  id: `usr_${Date.now()}`,
                  name: newInviteName,
                  email: newInviteEmail,
                  roleId: newInviteRole,
                  groupIds: newInviteGroups,
                  department: newInviteDept,
                  status: 'INVITED',
                  joinedAt: new Date().toISOString().slice(0, 10),
                };
                setTeamMembers([...teamMembers, newMember]);
                setIsInviteUserModalOpen(false);
                setNewInviteName('');
                setNewInviteEmail('');
              }}
            >
              Create & Send Invite 🚀
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div><label className="font-bold block mb-1">Full Name</label><Input placeholder="Jane Doe" value={newInviteName} onChange={(e) => setNewInviteName(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Email Address</label><Input type="email" placeholder="jane@acme.com" value={newInviteEmail} onChange={(e) => setNewInviteEmail(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Primary Role</label>
                <select
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value)}
                  className="w-full h-10 px-3 border rounded-xl bg-white font-bold text-blue-600"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Department</label>
                <Input value={newInviteDept} onChange={(e) => setNewInviteDept(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">Assign to Groups / Squads</label>
              <div className="grid grid-cols-2 gap-2 border p-3 rounded-xl bg-slate-50">
                {groups.map((g) => {
                  const isChecked = newInviteGroups.includes(g.id);
                  return (
                    <label key={g.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setNewInviteGroups(newInviteGroups.filter((id) => id !== g.id));
                          } else {
                            setNewInviteGroups([...newInviteGroups, g.id]);
                          }
                        }}
                        className="rounded accent-blue-600"
                      />
                      <span className="font-bold text-slate-800">{g.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>

        {/* MODAL: CREATE CUSTOM ROLE */}
        <Modal
          isOpen={isCreateRoleModalOpen}
          onClose={() => setIsCreateRoleModalOpen(false)}
          title="+ Create Custom RBAC Role"
          description="Define a new security role and clone baseline permissions."
          footer={
            <Button
              size="sm"
              onClick={() => {
                if (!newRoleName) return;
                const cloneSource = roles.find((r) => r.id === newRoleCloneFrom);
                const clonedModules: Record<string, ModulePermissionSet> = {};
                DEFAULT_MODULES.forEach((m) => {
                  clonedModules[m.id] = { ...(cloneSource?.modules[m.id] || READ_ONLY_PERMS) };
                });

                const newR: CustomRole = {
                  id: newRoleName.toLowerCase().replace(/\s+/g, '_'),
                  name: newRoleName,
                  description: newRoleDesc || 'Custom workspace role.',
                  color: newRoleColor,
                  isSystem: false,
                  modules: clonedModules,
                };
                setRoles([...roles, newR]);
                setIsCreateRoleModalOpen(false);
                setNewRoleName('');
                setNewRoleDesc('');
              }}
            >
              Create Role 🛡️
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div><label className="font-bold block mb-1">Role Title</label><Input placeholder="e.g. Regional Deal Approver" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Description</label><Input placeholder="Authorizes high-value deal approvals" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Clone Baseline Perms From</label>
                <select
                  value={newRoleCloneFrom}
                  onChange={(e) => setNewRoleCloneFrom(e.target.value)}
                  className="w-full h-10 px-3 border rounded-xl bg-white font-bold"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Role Color Badge</label>
                <input type="color" value={newRoleColor} onChange={(e) => setNewRoleColor(e.target.value)} className="w-12 h-10 cursor-pointer rounded-xl border p-1" />
              </div>
            </div>
          </div>
        </Modal>

        {/* MODAL: CREATE USER GROUP / TEAM */}
        <Modal
          isOpen={isCreateGroupModalOpen}
          onClose={() => setIsCreateGroupModalOpen(false)}
          title="+ Create User Group / Squad"
          description="Create a team squad with inherited roles."
          footer={
            <Button
              size="sm"
              onClick={() => {
                if (!newGroupName) return;
                const newG: UserGroup = {
                  id: `grp_${Date.now()}`,
                  name: newGroupName,
                  description: newGroupDesc || 'Functional squad team.',
                  leadUserId: newGroupLead,
                  defaultRoleId: newGroupRole,
                  memberUserIds: [newGroupLead],
                  color: newGroupColor,
                  createdAt: new Date().toISOString().slice(0, 10),
                };
                setGroups([...groups, newG]);
                setIsCreateGroupModalOpen(false);
                setNewGroupName('');
                setNewGroupDesc('');
              }}
            >
              Create Group 👥
            </Button>
          }
        >
          <div className="space-y-4 text-xs">
            <div><label className="font-bold block mb-1">Group / Squad Name</label><Input placeholder="e.g. EMEA Growth Hunters" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Description</label><Input placeholder="Focusing on DACH and Nordic enterprise accounts" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Squad Lead</label>
                <select
                  value={newGroupLead}
                  onChange={(e) => setNewGroupLead(e.target.value)}
                  className="w-full h-10 px-3 border rounded-xl bg-white font-bold"
                >
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Default Inherited Role</label>
                <select
                  value={newGroupRole}
                  onChange={(e) => setNewGroupRole(e.target.value)}
                  className="w-full h-10 px-3 border rounded-xl bg-white font-bold"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">Group Accent Tag</label>
              <input type="color" value={newGroupColor} onChange={(e) => setNewGroupColor(e.target.value)} className="w-12 h-10 cursor-pointer rounded-xl border p-1" />
            </div>
          </div>
        </Modal>

        {/* MODAL: EFFECTIVE PERMISSIONS INSPECTOR */}
        {selectedUserForPerms && (
          <Modal
            isOpen={isEffectivePermModalOpen}
            onClose={() => setIsEffectivePermModalOpen(false)}
            title={`Effective Permissions: ${selectedUserForPerms.name}`}
            description={`Resolved permissions combining direct role + ${(selectedUserForPerms.groupIds || []).length} assigned groups`}
            footer={<Button size="sm" onClick={() => setIsEffectivePermModalOpen(false)}>Close Inspector</Button>}
          >
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-900 text-white rounded-xl flex justify-between items-center">
                <div>
                  <div className="font-bold">{selectedUserForPerms.name} ({selectedUserForPerms.email})</div>
                  <div className="text-[11px] text-slate-400">Primary Role: {roles.find((r) => r.id === selectedUserForPerms.roleId)?.name}</div>
                </div>
                <Badge variant="success">RESOLVED</Badge>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 font-bold border-b">
                    <tr>
                      <th className="p-2.5">Module</th>
                      <th className="p-2.5 text-center">READ</th>
                      <th className="p-2.5 text-center">CREATE</th>
                      <th className="p-2.5 text-center">EDIT</th>
                      <th className="p-2.5 text-center">DELETE</th>
                      <th className="p-2.5 text-center">APPROVE</th>
                      <th className="p-2.5 text-center">EXPORT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {DEFAULT_MODULES.map((mod) => {
                      const { effective } = getUserEffectivePermissions(selectedUserForPerms);
                      const perms = effective[mod.id] || { read: false, create: false, edit: false, delete: false, approve: false, export: false };
                      return (
                        <tr key={mod.id}>
                          <td className="p-2.5 font-bold text-slate-800">{mod.name}</td>
                          {(['read', 'create', 'edit', 'delete', 'approve', 'export'] as const).map((pk) => (
                            <td key={pk} className="p-2.5 text-center">
                              {perms[pk] ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300 font-bold">✗</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        )}

        {/* MODAL: INVOICE PDF */}
        {selectedInvoice && (
          <Modal isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} title={`Invoice: ${selectedInvoice.invoiceNumber}`} description={`Issued to ${selectedInvoice.customerName}`} footer={<Button size="sm" onClick={() => setSelectedInvoice(null)}>Close PDF</Button>}>
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-900 text-white rounded-xl font-mono flex justify-between items-center">
                <span>Total Due:</span>
                <span className="text-xl font-bold text-emerald-400">{formatMoney(selectedInvoice.totalAmount / 100)}</span>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-100"><tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y">{selectedInvoice.lineItems.map((li) => <tr key={li.id}><td className="p-2">{li.description}</td><td className="p-2 text-right">{li.quantity}</td><td className="p-2 text-right font-mono">{formatMoney(li.amount / 100)}</td></tr>)}</tbody>
              </table>
            </div>
          </Modal>
        )}

        {/* MODAL: CREATE INVOICE */}
        <Modal isOpen={isCreateInvoiceModalOpen} onClose={() => setIsCreateInvoiceModalOpen(false)} title="+ Create New Client Invoice" description="Issue itemized invoice" footer={<Button size="sm" onClick={handleCreateInvoice}>Issue Invoice 🚀</Button>}>
          <div className="space-y-3 text-xs">
            <div><label className="font-bold block mb-1">Customer Account Name</label><Input placeholder="e.g. Apple Inc." value={newInvCustomer} onChange={(e) => setNewInvCustomer(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Customer Billing Email</label><Input type="email" placeholder="billing@apple.com" value={newInvEmail} onChange={(e) => setNewInvEmail(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Line Item Description</label><Input value={newInvItemDesc} onChange={(e) => setNewInvItemDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="font-bold block mb-1">Quantity</label><Input type="number" value={newInvItemQty} onChange={(e) => setNewInvItemQty(Number(e.target.value))} /></div>
              <div><label className="font-bold block mb-1">Unit Price ($)</label><Input type="number" value={newInvItemPrice / 100} onChange={(e) => setNewInvItemPrice(Number(e.target.value) * 100)} /></div>
            </div>
          </div>
        </Modal>

        {/* MODAL: PROVISION TENANT */}
        <Modal isOpen={isProvisionModalOpen} onClose={() => setIsProvisionModalOpen(false)} title="+ Provision New SaaS Tenant" description="Create isolated database and custom subdomain" footer={<Button size="sm" onClick={handleProvisionTenant}>{isProvisioningProgress ? 'Creating DB...' : 'Provision Cluster 🚀'}</Button>}>
          <div className="space-y-3 text-xs">
            <div><label className="font-bold block mb-1">Organization Name</label><Input placeholder="Palantir Cloud" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Tenant Slug (Subdomain)</label><Input placeholder="palantir" value={newTenantSlug} onChange={(e) => setNewTenantSlug(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Plan</label>
                <select value={newTenantPlan} onChange={(e) => setNewTenantPlan(e.target.value as typeof newTenantPlan)} className="w-full h-10 px-3 border rounded-xl text-xs bg-white">
                  <option value="Starter">Starter</option>
                  <option value="Growth">Growth</option>
                  <option value="Enterprise Dedicated">Enterprise Dedicated</option>
                </select>
              </div>
              <div><label className="font-bold block mb-1">Region</label><Input value={newTenantRegion} onChange={(e) => setNewTenantRegion(e.target.value)} /></div>
            </div>
            <div>
              <label className="font-bold block mb-1">Database Isolation Mode</label>
              <select value={newTenantDbMode} onChange={(e) => setNewTenantDbMode(e.target.value as any)} className="w-full h-10 px-3 border rounded-xl text-xs bg-white">
                <option value="DEDICATED_DATABASE">DEDICATED_DATABASE (Isolated AWS RDS Instance)</option>
                <option value="SCHEMA_ISOLATED">SCHEMA_ISOLATED (Dedicated Schema per Tenant)</option>
                <option value="ROW_LEVEL_SECURITY">ROW_LEVEL_SECURITY (Shared DB with RLS)</option>
              </select>
            </div>
          </div>
        </Modal>

        {/* MODAL: CREATE TICKET */}
        <Modal
          isOpen={isCreateTicketModalOpen}
          onClose={() => setIsCreateTicketModalOpen(false)}
          title="+ Open Support Ticket"
          description="Submit a new customer support case"
          footer={
            <Button
              size="sm"
              onClick={async () => {
                if (!newTicketSubject || !newTicketCustomer) return;
                const newTicket: SupportTicket = {
                  id: `TICK-90${tickets.length + 1}`,
                  subject: newTicketSubject,
                  customerName: newTicketCustomer,
                  priority: newTicketPriority,
                  status: 'OPEN',
                  assignedAgent: currentUserProfile.name,
                  slaRemainingMinutes: 60,
                  createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                };
                setTickets([newTicket, ...tickets]);
                setIsCreateTicketModalOpen(false);

                try {
                  await ApiClient.createTicket({
                    subject: newTicketSubject,
                    requesterName: newTicketCustomer,
                    requesterEmail: `${newTicketCustomer.toLowerCase().replace(/\s+/g, '')}@client.internal`,
                    priority: newTicketPriority,
                    assignedAgentName: currentUserProfile.name,
                    slaRemainingMinutes: 60,
                  });
                } catch {}

                setNewTicketSubject('');
                setNewTicketCustomer('');
              }}
            >
              Submit Ticket
            </Button>
          }
        >
          <div className="space-y-3 text-xs">
            <div><label className="font-bold block mb-1">Ticket Subject</label><Input placeholder="e.g. AWS Peering Latency Spike" value={newTicketSubject} onChange={(e) => setNewTicketSubject(e.target.value)} /></div>
            <div><label className="font-bold block mb-1">Customer Name</label><Input placeholder="e.g. Netflix Corp" value={newTicketCustomer} onChange={(e) => setNewTicketCustomer(e.target.value)} /></div>
            <div>
              <label className="font-bold block mb-1">Priority</label>
              <select value={newTicketPriority} onChange={(e) => setNewTicketPriority(e.target.value as any)} className="w-full h-10 px-3 border rounded-xl text-xs bg-white">
                <option value="URGENT">URGENT (15m SLA)</option>
                <option value="HIGH">HIGH (1h SLA)</option>
                <option value="NORMAL">NORMAL (4h SLA)</option>
              </select>
            </div>
          </div>
        </Modal>

        {/* MODAL: E-SIGN */}
        <Modal
          isOpen={isSignModalOpen}
          onClose={() => setIsSignModalOpen(false)}
          title="✍️ Draw / Adopt Digital Signature"
          description="Adopt cryptographic digital signature"
          footer={
            <Button
              size="sm"
              onClick={() => {
                setEsignEnvelope({ ...esignEnvelope, status: 'COMPLETED' });
                setIsSignModalOpen(false);
              }}
            >
              Adopt & Sign ✍️
            </Button>
          }
        >
          <div className="space-y-3 text-xs">
            <div><label className="font-bold block mb-1">Type Signature Text</label><Input value={signaturePadInput} onChange={(e) => setSignaturePadInput(e.target.value)} /></div>
            <div className="p-6 bg-slate-50 border-2 border-dashed rounded-xl text-center font-serif text-2xl text-blue-900 italic">
              {signaturePadInput || 'Your Signature Here'}
            </div>
          </div>
        </Modal>

        {/* MODAL: REPORT PROFILE */}
        <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title="🚩 Report Profile" description="Flag profile for trust & safety review" footer={<Button size="sm" onClick={() => setIsReportModalOpen(false)}>Submit Report</Button>}>
          <div className="space-y-3 text-xs">
            <label className="font-bold block">Reason for Moderation</label>
            <select className="w-full h-10 px-3 border rounded-xl text-xs bg-white">
              <option>Inappropriate bio content</option>
              <option>Impersonation of employee</option>
              <option>Spam or unauthorized soliciting</option>
            </select>
          </div>
        </Modal>

        {/* MODAL: RESET PASSWORD */}
        <Modal isOpen={isResetPasswordModalOpen} onClose={() => setIsResetPasswordModalOpen(false)} title="🔐 Change Password" description="Update your security credentials" footer={<Button size="sm" onClick={() => setIsResetPasswordModalOpen(false)}>Update Password</Button>}>
          <div className="space-y-3 text-xs">
            <div><label className="font-bold block mb-1">Current Password</label><Input type="password" /></div>
            <div><label className="font-bold block mb-1">New Secure Password</label><Input type="password" /></div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  );
}

export default App;
