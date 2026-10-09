'use client';

import React, { useMemo } from 'react';
import {
  Bot,
  ShieldCheck,
  Cpu,
  Database,
  Lock,
  Sparkles,
  ClipboardList,
  Clock,
  Zap,
  Wrench,
  Package,
  Layers,
} from 'lucide-react';
import { StatusBadge, Badge } from '@medusajs/ui';
import {
  GigaLibsCopilotKitProvider,
  CopilotChat,
} from '../../../../../vendor/copilotkit/dist/copilotkit.mjs';
import { DailyInspectionChecklistCard } from '@/components/assistant/DailyInspectionChecklistCard';
import { CopilotKitStylesheet } from '@/components/assistant/CopilotKitStylesheet';

function AssistantMarkdownWithGenerativeUI({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const isDailyInspection =
    content.includes('Daily Inspection Checklist') ||
    content.includes('INSP-2026-ABC-09');

  return (
    <div className={className}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      {isDailyInspection && (
        <div className="mt-4">
          <DailyInspectionChecklistCard />
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const [dynamicSuggestions, setDynamicSuggestions] = React.useState<string[]>([
    'Tell me my todays daily inspection tasks in unit abc',
    'Get me the downtimes for all the equipments in the plant',
    'Total electricity consumption of the last 24 hrs',
    'Status of work orders in substation 4',
  ]);
  const [hasInteracted, setHasInteracted] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('gigalibs_assistant_recent_queries');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDynamicSuggestions(Array.from(new Set([...parsed, ...dynamicSuggestions])).slice(0, 5));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSendPreset = (promptText: string) => {
    setHasInteracted(true);
    try {
      const stored = localStorage.getItem('gigalibs_assistant_recent_queries');
      const existing = stored ? JSON.parse(stored) : [];
      const updated = Array.from(new Set([promptText, ...existing])).slice(0, 8);
      localStorage.setItem('gigalibs_assistant_recent_queries', JSON.stringify(updated));
    } catch {
      // ignore
    }

    const container = document.querySelector('[data-copilotkit]');
    if (!container) return;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, promptText);
      } else {
        textarea.value = promptText;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();

      setTimeout(() => {
        const sendBtn = container.querySelector(
          '[data-testid="copilot-send-button"]'
        ) as HTMLButtonElement | null;
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
        } else {
          textarea.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
          );
        }
      }, 50);
    }
  };

  const toolRenderers = useMemo(
    () => [
      {
        name: 'render_daily_inspection_checklist',
        render: () => <DailyInspectionChecklistCard />,
      },
      {
        name: 'daily_inspections',
        render: () => <DailyInspectionChecklistCard />,
      },
    ],
    []
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-ui-bg-subtle/40 p-4 md:p-6 overflow-hidden">
      <CopilotKitStylesheet />
      {/* Top Header */}
      <header className="mb-4 flex flex-col justify-between gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-ui-fg-base">
                  GigaLibs Sovereign Operational Assistant
                </h1>
                <Badge color="blue" size="small">
                  CORE IMPLEMENTED
                </Badge>
                <StatusBadge color="green">ONLINE</StatusBadge>
              </div>
              <p className="text-xs text-ui-fg-muted">
                Deterministic cross-module operational intelligence with sovereign tenancy and zero third-party telemetry.
              </p>
            </div>
          </div>
        </div>

        {/* Boundary Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ui-border-subtle bg-ui-bg-subtle px-2.5 py-1 text-xs font-medium text-ui-fg-subtle">
            <ShieldCheck className="h-3.5 w-3.5 text-ui-fg-interactive" /> Zero Egress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ui-border-subtle bg-ui-bg-subtle px-2.5 py-1 text-xs font-medium text-ui-fg-subtle">
            <Lock className="h-3.5 w-3.5 text-ui-fg-interactive" /> Tenant RBAC
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ui-border-subtle bg-ui-bg-subtle px-2.5 py-1 text-xs font-medium text-ui-fg-subtle">
            <Cpu className="h-3.5 w-3.5 text-ui-fg-interactive" /> Same-Origin SSE
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-4">
        {/* Left / Center Chat Column (3 cols on large) */}
        <div className="flex flex-col rounded-xl border border-ui-border-base bg-ui-bg-base shadow-xs overflow-hidden lg:col-span-3">
          {/* CopilotChat Body */}
          <div className="flex-1 overflow-hidden h-full flex flex-col min-h-0 relative" data-copilotkit>
            <GigaLibsCopilotKitProvider renderToolCalls={toolRenderers}>
              <CopilotChat
                className="flex-1 h-full flex flex-col min-h-0"
                messageView={{
                  assistantMessage: {
                    markdownRenderer: AssistantMarkdownWithGenerativeUI,
                  },
                }}
                labels={{
                  welcomeMessageText:
                    'How can I assist your operations today? Query assets, work orders, storeroom inventory, or plant telemetry.',
                  chatInputPlaceholder: 'Ask GigaLibs Sovereign Assistant...',
                  chatDisclaimerText:
                    'GigaLibs Sovereign Intelligence • Multi-Tenant Operational Platform',
                }}
              />
            </GigaLibsCopilotKitProvider>

            {/* Dynamic Suggestion Pills */}
            {!hasInteracted && dynamicSuggestions.length > 0 && (
              <div className="px-4 pb-3 pt-2 border-t border-ui-border-subtle bg-ui-bg-subtle/40 shrink-0">
                <div className="text-[11px] font-medium text-ui-fg-muted mb-2 flex items-center justify-between">
                  <span>Contextual Suggestions:</span>
                  <span className="text-[10px] text-ui-fg-muted/70">Click to execute query</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dynamicSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendPreset(suggestion)}
                      className="inline-flex items-center gap-1 rounded-full border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs font-medium text-ui-fg-base hover:bg-ui-bg-base-hover hover:border-ui-border-interactive transition-colors cursor-pointer shadow-2xs"
                    >
                      <Sparkles className="h-3 w-3 text-ui-fg-interactive" /> {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Info Column (1 col on large) */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Sovereign Runtime Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ui-fg-base">
              <ShieldCheck className="h-4 w-4 text-ui-fg-interactive" /> Sovereign Runtime
            </h2>
            <div className="mt-3 divide-y divide-ui-border-subtle text-xs">
              <div className="flex justify-between py-2">
                <span className="text-ui-fg-muted">Protocol:</span>
                <span className="font-mono font-semibold text-ui-fg-base">SSE / REST</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-ui-fg-muted">Endpoint:</span>
                <span className="font-mono text-ui-fg-base">/api/gigalibs-assistant</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-ui-fg-muted">Telemetry Egress:</span>
                <span className="font-semibold text-ui-fg-interactive">0 Bytes (Disabled)</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-ui-fg-muted">Tenancy:</span>
                <span className="font-semibold text-ui-fg-base">PostgreSQL RLS</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-ui-fg-muted">Port Binding:</span>
                <span className="font-mono text-ui-fg-base">5180 Exclusive</span>
              </div>
            </div>
          </div>

          {/* Connected Operational Domains Card */}
          <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-xs">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ui-fg-base">
              <Database className="h-4 w-4 text-ui-fg-interactive" /> Operational Domains
            </h2>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-ui-border-subtle bg-ui-bg-subtle p-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-ui-fg-interactive" />
                  <span className="font-medium text-ui-fg-base">CMMS Inspections</span>
                </div>
                <Badge color="green" size="small">
                  CONNECTED
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ui-border-subtle bg-ui-bg-subtle p-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-ui-fg-interactive" />
                  <span className="font-medium text-ui-fg-base">Equipment Downtimes</span>
                </div>
                <Badge color="green" size="small">
                  CONNECTED
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ui-border-subtle bg-ui-bg-subtle p-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-ui-fg-interactive" />
                  <span className="font-medium text-ui-fg-base">Smart Meters (24h)</span>
                </div>
                <Badge color="green" size="small">
                  CONNECTED
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ui-border-subtle bg-ui-bg-subtle p-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-ui-fg-interactive" />
                  <span className="font-medium text-ui-fg-base">Work Orders</span>
                </div>
                <Badge color="green" size="small">
                  CONNECTED
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ui-border-subtle bg-ui-bg-subtle p-2">
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-ui-fg-interactive" />
                  <span className="font-medium text-ui-fg-base">MRO Inventory</span>
                </div>
                <Badge color="green" size="small">
                  CONNECTED
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
