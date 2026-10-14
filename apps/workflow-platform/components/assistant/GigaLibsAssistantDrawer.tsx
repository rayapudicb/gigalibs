'use client';

import React, { useEffect, useMemo } from 'react';
import { Bot, ShieldAlert, X } from 'lucide-react';
import { GigaLibsCopilotKitProvider, CopilotChat } from '../../../../vendor/copilotkit/dist/copilotkit.mjs';
import { DailyInspectionChecklistCard } from './DailyInspectionChecklistCard';
import { CopilotKitStylesheet } from './CopilotKitStylesheet';
import { StatusBadge } from '@medusajs/ui';

interface GigaLibsAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

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
        <div className="mt-3">
          <DailyInspectionChecklistCard />
        </div>
      )}
    </div>
  );
}

export function GigaLibsAssistantDrawer({
  isOpen,
  onClose,
}: GigaLibsAssistantDrawerProps) {
  const [dynamicSuggestions, setDynamicSuggestions] = React.useState<string[]>([
    'Tell me my todays daily inspection tasks in unit abc',
    'Get me the downtimes for all the equipments in the plant',
    'Total electricity consumption of the last 24 hrs',
    'Check active work orders for substation 4',
  ]);
  const [hasInteracted, setHasInteracted] = React.useState(false);

  // Load recent queries from localStorage and blend with role defaults
  useEffect(() => {
    try {
      const stored = localStorage.getItem('gigalibs_assistant_recent_queries');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDynamicSuggestions(Array.from(new Set([...parsed, ...dynamicSuggestions])).slice(0, 4));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="GigaLibs Assistant"
      className="fixed inset-0 z-50 flex justify-end bg-ui-bg-overlay/40 backdrop-blur-xs transition-opacity duration-200"
    >
      <CopilotKitStylesheet />
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-ui-border-base bg-ui-bg-base shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Minimal Claude/ChatGPT Style Header */}
        <header className="flex h-14 items-center justify-between border-b border-ui-border-base bg-ui-bg-base px-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ui-button-inverted text-ui-fg-on-inverted shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-ui-fg-base">
                  GigaLibs Assistant
                </h2>
                <StatusBadge color="green">Sovereign</StatusBadge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              title="Close Assistant"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ui-fg-muted hover:bg-ui-bg-subtle hover:text-ui-fg-base transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* CopilotKit Chat Body with Claude / GPT Styling */}
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
                welcomeMessageText: 'How can I assist your operations today? Ask about asset inspections, plant telemetry, or work orders.',
                chatInputPlaceholder: 'Ask GigaLibs Assistant...',
                chatDisclaimerText: 'Sovereign Operational Intelligence • Zero External Egress',
              }}
            />
          </GigaLibsCopilotKitProvider>

          {/* Dynamic Contextual Suggestion Chips (Claude / GPT style empty state) */}
          {!hasInteracted && dynamicSuggestions.length > 0 && (
            <div className="px-4 pb-2 pt-1 border-t border-ui-border-subtle bg-ui-bg-subtle/30 shrink-0">
              <div className="text-[11px] font-medium text-ui-fg-muted mb-1.5 flex items-center justify-between">
                <span>Suggested for your role:</span>
                <span className="text-[10px] text-ui-fg-muted/70">Click to run</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {dynamicSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendPreset(suggestion)}
                    className="text-left text-xs text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base bg-ui-bg-subtle/80 border border-ui-border-subtle hover:border-ui-border-interactive/40 rounded-lg px-2.5 py-1.5 transition-all truncate"
                  >
                    💡 {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
