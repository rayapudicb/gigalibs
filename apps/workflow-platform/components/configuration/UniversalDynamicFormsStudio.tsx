'use client';

import {
  type FormTemplateCategory,
  type FormTemplateItem,
  FORM_TEMPLATE_CATEGORIES,
  FORM_TEMPLATES_CATALOG,
} from '@/lib/form-templates-catalog';
import {
  INDUSTRY_WORKFORCE_TEMPLATES,
  type IndustryWorkforceTemplate,
} from '@/lib/industry-workforce-templates';
import {
  ConfigurationForm,
  type ConfigurationValues,
} from '@gigalibs/configuration-react';
import { type ConfigurationDefinition, holdsAnyPermission } from '@gigalibs/contracts';
import { Button, Input, toast as medusaToast } from '@medusajs/ui';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  BookOpen,
  Boxes,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Code,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  HardHat,
  Heart,
  HelpCircle,
  Home,
  Layers,
  Mail,
  Megaphone,
  MessageSquare,
  Monitor,
  Plus,
  Rocket,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  Stethoscope,
  Target,
  Ticket,
  UserCheck,
  Video,
  Wheat,
  Wrench,
  X,
} from 'lucide-react';
import { solutionHasRoute } from '@/lib/module-navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ModuleControlBar } from '@/components/layout/ModuleControlBar';
import { SolutionPacksPanel } from '@/components/configuration/SolutionPacksPanel';
import { ApplicationDictionaryWorkbench } from '@/components/configuration/ApplicationDictionaryWorkbench';

type StudioTab = 'templates' | 'industry-packs' | 'active-apps' | 'surfaces' | 'dictionary';

type RuntimeApp = {
  entityKey: string;
  surfaceKey: string;
  publishedVersionId: string;
  checksum: string;
  sequence: number;
  manifest: ConfigurationDefinition;
};

type SurfaceItem = {
  registrationKey: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  label: string;
  description: string;
  route: string;
  ownership: string;
  authoringEnabled: boolean;
};

const ICON_MAP: Record<string, React.ElementType> = {
  Target,
  Smile,
  ShoppingBag: Boxes,
  Home,
  Mail,
  BarChart2,
  Briefcase,
  Calendar,
  CreditCard,
  Heart,
  Shield,
  Activity,
  CheckSquare: ClipboardCheck,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
  BookOpen,
  Code,
  Megaphone,
  FileText,
  UserCheck,
  Video,
  ShieldAlert,
  ClipboardCheck,
};

export function UniversalDynamicFormsStudio({
  currentUserId,
  permissions,
  tenantId,
  tenantName,
  locale = 'en-US',
  currency = 'USD',
}: {
  currentUserId: string;
  permissions: string[];
  tenantId: string;
  tenantName: string;
  locale?: string;
  currency?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudioTab>('templates');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplateItem | IndustryWorkforceTemplate | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewValues, setPreviewValues] = useState<ConfigurationValues>({});
  const [deployTemplate, setDeployTemplate] = useState<FormTemplateItem | IndustryWorkforceTemplate | null>(null);
  const [deployAppKey, setDeployAppKey] = useState('');
  const [deployTitle, setDeployTitle] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  // Runtime apps & registered surfaces telemetry
  const [runtimeApps, setRuntimeApps] = useState<RuntimeApp[]>([]);
  const [surfaces, setSurfaces] = useState<SurfaceItem[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const canDraft = holdsAnyPermission(permissions, ['configuration:draft']);

  useEffect(() => {
    let mounted = true;
    async function fetchMetadata() {
      try {
        const [appsRes, surfacesRes] = await Promise.all([
          fetch('/api/control/configuration/apps', { cache: 'no-store' }),
          fetch('/api/control/configuration/surfaces', { cache: 'no-store' }),
        ]);
        if (mounted) {
          if (appsRes.ok) {
            setRuntimeApps((await appsRes.json()) as RuntimeApp[]);
          }
          if (surfacesRes.ok) {
            setSurfaces((await surfacesRes.json()) as SurfaceItem[]);
          }
        }
      } catch {
        // Fallback silently if offline or restricted
      } finally {
        if (mounted) setIsLoadingMetadata(false);
      }
    }
    void fetchMetadata();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    return FORM_TEMPLATES_CATALOG.filter((template) => {
      const matchesCategory =
        selectedCategory === 'ALL' || template.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        template.name.toLowerCase().includes(q) ||
        template.description.toLowerCase().includes(q) ||
        template.category.toLowerCase().includes(q) ||
        template.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: FORM_TEMPLATES_CATALOG.length };
    for (const item of FORM_TEMPLATES_CATALOG) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const handleOpenDeployModal = (template: FormTemplateItem) => {
    setDeployTemplate(template);
    setDeployTitle(template.name);
    // Generate clean slug key
    const baseKey = template.definition.entityKey || template.id;
    setDeployAppKey(baseKey);
  };

  const handleCreateDraftAndDeploy = async () => {
    if (!deployTemplate) return;
    setIsDeploying(true);
    try {
      const sanitizedKey = deployAppKey
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!sanitizedKey || sanitizedKey.length < 2) {
        throw new Error('Please specify a valid lowercase kebab-case application key (at least 2 characters).');
      }

      const definitionToDeploy: ConfigurationDefinition = {
        ...deployTemplate.definition,
        entityKey: sanitizedKey,
        title: deployTitle.trim() || deployTemplate.name,
      };

      const payload = {
        definition: definitionToDeploy,
        reason: `Initialize new application draft from template: ${deployTemplate.name}`,
        idempotencyKey: crypto.randomUUID(),
      };

      const response = await fetch('/api/control/configuration/change-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || `Failed to create change set (${response.status})`);
      }

      medusaToast.success(`Created draft for "${deployTitle}". Launching Visual Studio Workbench…`);
      setDeployTemplate(null);
      // Navigate to isolated studio mode with the initial surface
      router.push(`/studio/configuration?surface=tenant-record-application&template=${encodeURIComponent(deployTemplate.id)}`);
    } catch (err) {
      medusaToast.error(err instanceof Error ? err.message : 'Deployment failed.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f7f8fa] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Studio View Navigation (Zone 2: Standard Segmented Pill Controls + Action Suite) */}
        <ModuleControlBar<StudioTab>
          views={[
            {
              id: 'templates',
              label: 'Template Library',
              badge: FORM_TEMPLATES_CATALOG.length,
            },
            {
              id: 'industry-packs',
              label: 'Industry packs',
              icon: <ShieldCheck className="h-4 w-4 text-purple-600" />,
            },
            {
              id: 'active-apps',
              label: 'Active Tenant Applications',
              badge: runtimeApps.length,
            },
            {
              id: 'surfaces',
              label: 'Registered Extension Surfaces',
              badge: surfaces.length,
            },
            {
              id: 'dictionary',
              label: 'Application Dictionary',
              icon: <BookOpen className="h-4 w-4 text-emerald-600" />,
            },
          ]}
          activeView={activeTab}
          onViewChange={setActiveTab}
          ariaLabel="Dynamic Forms Studio sections"
          actions={
            <>
              <Link
                href="/studio/configuration"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Fullscreen Designer
              </Link>
              <button
                type="button"
                onClick={() => {
                  router.push('/studio/configuration?surface=tenant-record-application');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5 text-zinc-600" />
                Create Blank Form
              </button>
            </>
          }
        />

        {/* TAB 1: TEMPLATE LIBRARY */}
        {activeTab === 'templates' && (
          <div>
            {/* Search and Filters */}
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search templates by name, domain, tags, or fields…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-xs font-medium text-zinc-500">
                Showing <span className="font-semibold text-zinc-900">{filteredTemplates.length}</span> of{' '}
                {FORM_TEMPLATES_CATALOG.length} templates
              </p>
            </div>

            {/* Category Pills */}
            <div className="mb-8 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                All Categories ({categoryCounts.ALL})
              </button>
              {FORM_TEMPLATE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {category} ({categoryCounts[category] ?? 0})
                </button>
              ))}
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const IconComponent = ICON_MAP[template.iconName] || FileText;
                return (
                  <div
                    key={template.id}
                    className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs transition hover:border-zinc-300 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                          {template.category}
                        </span>
                      </div>

                      <h3 className="mt-4 text-base font-semibold text-zinc-950">{template.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{template.description}</p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 border border-zinc-100">
                          {template.definition.fields.length} fields
                        </span>
                        <span className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 border border-zinc-100">
                          ~{template.estimatedMinutes} min setup
                        </span>
                        {template.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 flex items-center gap-2 border-t border-zinc-100 pt-4">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setPreviewValues({});
                          setPreviewTemplate(template);
                        }}
                        className="flex-1 justify-center text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          router.push(
                            `/studio/configuration?template=${encodeURIComponent(template.id)}`
                          );
                        }}
                        className="flex-1 justify-center text-xs"
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" />
                        Customize
                      </Button>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() => handleOpenDeployModal(template)}
                        disabled={!canDraft}
                        className="flex-1 justify-center text-xs"
                      >
                        <Rocket className="h-3.5 w-3.5 mr-1" />
                        Use
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
                <Search className="mx-auto h-8 w-8 text-zinc-400" />
                <h3 className="mt-2 text-sm font-semibold text-zinc-900">No templates found</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Try adjusting your search query or switching to another category.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-4 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-200"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB: INDUSTRY OPERATIONS PACKS (ADR-0003) */}
        {activeTab === 'industry-packs' && (
          <div className="space-y-6">
            {/* WI-OI-107: the packs shipped at the solution layer; the form templates below are layer 2 (WI-OI-075). */}
            <SolutionPacksPanel
              canInstall={canDraft}
            />
            <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
                <h2 className="text-base font-bold text-zinc-950">
                  Form templates by industry
                </h2>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-mono font-bold text-purple-700">
                  ADR-0003 Phase 7
                </span>
              </div>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-zinc-600">
                Specialized industry vocabularies (Stagehands, Riggers, Harvesters, Cleanroom Operators, Equipment Drivers)
                exist exclusively in versioned presentation schemas. The underlying database and APIs remain strictly neutral
                (universal resources, allocations, and capabilities) while enforcing mandatory accreditation verification.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {INDUSTRY_WORKFORCE_TEMPLATES.map((template) => {
                let IconComp = FileText;
                if (template.iconName === 'Ticket') IconComp = Ticket;
                else if (template.iconName === 'Shield') IconComp = ShieldCheck;
                else if (template.iconName === 'Wheat') IconComp = Wheat;
                else if (template.iconName === 'HardHat') IconComp = HardHat;
                else if (template.iconName === 'Factory') IconComp = Boxes;
                else if (template.iconName === 'Stethoscope') IconComp = Stethoscope;

                return (
                  <div
                    key={template.id}
                    className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs transition hover:border-purple-300 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                          <IconComp className="h-5 w-5" />
                        </div>
                        <span className="rounded-md bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                          {template.industryLabel}
                        </span>
                      </div>

                      <h3 className="mt-4 text-base font-semibold text-zinc-950">{template.name}</h3>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{template.description}</p>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-800">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Guard: {template.requiredCapabilityCode}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 border border-zinc-100">
                            {template.definition.fields.length} fields
                          </span>
                          <span className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-500 border border-zinc-100">
                            ~{template.estimatedMinutes} min inspection
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewTemplate(template);
                          setPreviewValues({});
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        <Eye className="h-3.5 w-3.5 text-zinc-400" />
                        Preview
                      </button>

                      <div className="flex items-center gap-2">
                        {solutionHasRoute('/cmms') && (
                          <Link
                            href="/cmms"
                            className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition shadow-xs"
                          >
                            Deploy to Dispatch
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            router.push(`/studio/configuration?template=${encodeURIComponent(template.id)}`);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition shadow-xs"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Customize
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE TENANT APPLICATIONS */}
        {activeTab === 'active-apps' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-base font-semibold text-zinc-950">Deployed Tenant Applications</h2>
              <p className="mt-1 text-xs text-zinc-500">
                These forms have been authored, approved through governance, published, and activated
                in this tenant workspace. Each application is backed by full PostgreSQL CRUD.
              </p>

              <div className="mt-6 divide-y divide-zinc-100">
                {runtimeApps.map((app) => (
                  <div
                    key={`${app.entityKey}-${app.surfaceKey}`}
                    className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-zinc-900">
                          {app.manifest?.title || app.entityKey}
                        </h4>
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          v{app.sequence} ACTIVE
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        Route: <code className="font-mono text-zinc-700">/apps/{app.entityKey}</code>
                        {' · '}Checksum: <code className="font-mono text-[10px]">{app.checksum.slice(0, 12)}…</code>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/apps/${app.entityKey}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open App
                      </Link>
                      <Link
                        href={`/studio/configuration?surface=tenant-record-application`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 shadow-xs"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Edit in Studio
                      </Link>
                    </div>
                  </div>
                ))}

                {runtimeApps.length === 0 && (
                  <div className="py-12 text-center">
                    <Rocket className="mx-auto h-8 w-8 text-zinc-400" />
                    <p className="mt-2 text-sm font-medium text-zinc-700">No custom apps activated yet</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Pick any template from the library and click "Use" to deploy your first application.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REGISTERED EXTENSION SURFACES */}
        {activeTab === 'surfaces' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-base font-semibold text-zinc-950">Module Extension Surfaces</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Core domain surfaces registered with the NestJS control plane for tenant-scoped field configuration.
              </p>

              <div className="mt-6 divide-y divide-zinc-100">
                {surfaces.map((s) => (
                  <div
                    key={s.registrationKey}
                    className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-zinc-900">{s.label}</h4>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                          {s.ownership}
                        </span>
                        {s.authoringEnabled ? (
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Authoring Enabled
                          </span>
                        ) : (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Core Protected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{s.description}</p>
                      <p className="mt-1 font-mono text-[11px] text-zinc-400">
                        Surface: {s.moduleKey}/{s.entityKey}/{s.surfaceKey} · Target: {s.route}
                      </p>
                    </div>

                    <Link
                      href={`/studio/configuration?surface=${encodeURIComponent(s.registrationKey)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Configure Surface
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: APPLICATION DICTIONARY */}
        {activeTab === 'dictionary' && (
          <ApplicationDictionaryWorkbench
            currentUserId={currentUserId}
            permissions={permissions}
            tenantId={tenantId}
            tenantName={tenantName}
          />
        )}

        {/* MODAL: LIVE INTERACTIVE PREVIEW */}
        {previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
              <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                      {'category' in previewTemplate ? previewTemplate.category : previewTemplate.industryLabel}
                    </span>
                    <h2 className="text-base font-semibold text-zinc-950">{previewTemplate.name}</h2>
                  </div>
                  <p className="text-xs text-zinc-500">{previewTemplate.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Viewport toggle */}
                  <div className="flex rounded-lg border border-zinc-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('desktop')}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        previewViewport === 'desktop'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('mobile')}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        previewViewport === 'mobile'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      Mobile
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(null)}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-6">
                <div
                  className={`mx-auto transition-all ${
                    previewViewport === 'mobile'
                      ? 'w-[390px] rounded-3xl border-8 border-zinc-800 bg-white p-4 shadow-xl'
                      : 'w-full max-w-2xl bg-white p-6 rounded-xl border border-zinc-200 shadow-xs'
                  }`}
                >
                  <ConfigurationForm
                    definition={previewTemplate.definition}
                    values={previewValues}
                    onChange={setPreviewValues}
                  />
                </div>
              </div>

              <footer className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-4">
                <div className="text-xs text-zinc-500">
                  Interactive preview powered by <code className="font-mono text-zinc-700">@gigalibs/configuration-react</code>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setPreviewTemplate(null)}
                  >
                    Close Preview
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const id = previewTemplate.id;
                      setPreviewTemplate(null);
                      router.push(`/studio/configuration?template=${encodeURIComponent(id)}`);
                    }}
                  >
                    <Settings2 className="h-4 w-4 mr-1.5" />
                    Open in Visual Studio
                  </Button>
                </div>
              </footer>
            </div>
          </div>
        )}

        {/* MODAL: USE / DEPLOY TEMPLATE */}
        {deployTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-950">Deploy Form Template</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Deploy <span className="font-medium text-zinc-900">{deployTemplate.name}</span> into your tenant workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeployTemplate(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Application Name
                  </label>
                  <input
                    type="text"
                    value={deployTitle}
                    onChange={(e) => setDeployTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g., Q3 Inbound Client Intake"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Application Route Slug (lowercase kebab-case)
                  </label>
                  <div className="mt-1.5 flex items-center rounded-xl border border-zinc-200 px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                    <span className="font-mono text-xs text-zinc-400">/apps/</span>
                    <input
                      type="text"
                      value={deployAppKey}
                      onChange={(e) => setDeployAppKey(e.target.value)}
                      className="ml-1 w-full font-mono text-xs text-zinc-900 focus:outline-none"
                      placeholder="client-intake"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Users will access this form and view saved PostgreSQL records at{' '}
                    <code className="font-mono text-zinc-700">/apps/{deployAppKey || 'my-app'}</code>.
                  </p>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-800">
                  <p className="font-semibold">Enterprise Maker-Checker Protection:</p>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Deploying creates an initial Draft change-set in PostgreSQL. You can customize fields,
                    submit for review, approve, and activate with 1-click in the Visual Designer.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-zinc-100 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setDeployTemplate(null)}
                  disabled={isDeploying}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateDraftAndDeploy}
                  disabled={isDeploying || !deployAppKey.trim()}
                >
                  <Rocket className="h-4 w-4 mr-1.5" />
                  {isDeploying ? 'Initializing…' : 'Deploy & Open in Studio'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
