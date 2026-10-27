'use client';

import { CompanionChat } from '@/components/companion/CompanionChat';
import { Button } from '@medusajs/ui';
import * as React from 'react';

// WI-OI-120bc (Giga AI Companion): the floating launcher — a fixed button that opens the chat panel on any page. It is
// mounted in the app shell ONLY when the local model is configured (the layout gates on OLLAMA_HOST), so it is never a
// dead button where the Companion cannot run (owner decision D4a: no floating chat without a working backend).

export function CompanionLauncher(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {open ? (
        <div
          className="fixed bottom-20 right-6 z-40 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-base p-4 shadow-elevation-flyout print:hidden"
          role="dialog"
          aria-label="Giga AI Companion"
        >
          <CompanionChat />
        </div>
      ) : null}
      <div className="fixed bottom-6 right-6 z-40 print:hidden">
        <Button variant="primary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Ask Giga'}
        </Button>
      </div>
    </>
  );
}
