'use client';

import { getKnowledgeEntry, type ModuleKnowledgeEntry } from '@/lib/module-knowledge-registry';
import { ExclamationCircle, InformationCircle, ShieldCheck, XMark } from '@medusajs/icons';
import { Badge, Button, Heading, Text } from '@medusajs/ui';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function ModuleHeaderAndDrawer() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const entry: ModuleKnowledgeEntry = getKnowledgeEntry(pathname);

  return (
    <>
      {/* ── Top Header Single-Line Business Title & Info Trigger ── */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-ui-fg-muted truncate">
          <span className="font-medium hover:text-ui-fg-subtle transition-colors">
            {entry.category}
          </span>
          <span className="text-ui-fg-muted/60">/</span>
          <span className="font-semibold text-ui-fg-base text-sm truncate">
            {entry.businessTitle}
          </span>
        </div>

        {/* Knowledge Hub Info Button */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Open Module Knowledge Hub & Action Playbook"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-subtle-hover transition-colors border border-ui-border-base/70 shadow-sm shrink-0"
        >
          <InformationCircle className="w-3.5 h-3.5 text-ui-fg-interactive" />
          <span className="hidden sm:inline">Knowledge Hub</span>
        </button>
      </div>

      {/* ── 30% Right-to-Left Slide-over Knowledge Hub Drawer ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          {/* Backdrop blur */}
          <div
            className="fixed inset-0 bg-ui-bg-overlay/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-md lg:max-w-[32vw] bg-ui-bg-base border-l border-ui-border-base shadow-2xl flex flex-col h-full transform transition-transform ease-in-out duration-300">
              {/* Drawer Topbar */}
              <div className="p-5 border-b border-ui-border-base flex items-start justify-between bg-ui-bg-subtle/50">
                <div>
                  <Badge color="blue" size="small" className="gap-1 mb-1.5">
                    <InformationCircle className="w-3 h-3" /> Help
                  </Badge>
                  <Heading level="h2" className="text-lg">
                    {entry.businessTitle}
                  </Heading>
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                    Category: {entry.category}
                  </Text>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1 text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
                >
                  <XMark className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* WI-OI-120ak (S6, D7a): the catalogue's own words; nothing here is claimed beyond it. */}
                <div className="space-y-2">
                  <Text
                    size="xsmall"
                    weight="plus"
                    className="uppercase tracking-wider text-ui-fg-muted font-bold"
                  >
                    What this is
                  </Text>
                  <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base leading-relaxed text-sm text-ui-fg-base">
                    {entry.summary}
                  </div>
                </div>

                {entry.actions.length > 0 ? (
                  <div className="space-y-3">
                    <Text
                      size="xsmall"
                      weight="plus"
                      className="uppercase tracking-wider text-ui-fg-muted font-bold"
                    >
                      What you can do here
                    </Text>
                    <div className="space-y-2">
                      {entry.actions.map((action) => (
                        <div
                          key={action}
                          className="flex items-start gap-2.5 p-3 rounded-lg border border-ui-border-base bg-ui-bg-base"
                        >
                          <Text size="small" className="text-ui-fg-base">
                            {action}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {entry.guardrails.length > 0 ? (
                  <div className="space-y-2">
                    <Text
                      size="xsmall"
                      weight="plus"
                      className="uppercase tracking-wider text-ui-fg-muted font-bold"
                    >
                      Rules the system enforces
                    </Text>
                    <div className="rounded-lg border border-ui-border-base divide-y divide-ui-border-base bg-ui-bg-base">
                      {entry.guardrails.map((guard) => (
                        <div
                          key={guard}
                          className="flex items-start gap-2 p-3 text-xs text-ui-fg-subtle"
                        >
                          <ShieldCheck className="w-4 h-4 text-ui-fg-success shrink-0 mt-0.5" />
                          <span>{guard}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {entry.limitations.length > 0 ? (
                  <div className="space-y-2">
                    <Text
                      size="xsmall"
                      weight="plus"
                      className="uppercase tracking-wider text-ui-fg-muted font-bold"
                    >
                      Limits to know
                    </Text>
                    <div className="rounded-lg border border-ui-border-base divide-y divide-ui-border-base bg-ui-bg-base">
                      {entry.limitations.map((limit) => (
                        <div
                          key={limit}
                          className="flex items-start gap-2 p-3 text-xs text-ui-fg-subtle"
                        >
                          <ExclamationCircle className="w-4 h-4 text-ui-fg-muted shrink-0 mt-0.5" />
                          <span>{limit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-ui-border-base bg-ui-bg-subtle flex items-center justify-end">
                <Button size="small" variant="secondary" onClick={() => setIsOpen(false)}>
                  Close Hub
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
