'use client';

import React, { useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { GigaLibsAssistantDrawer } from './GigaLibsAssistantDrawer';

interface AssistantLauncherProps {
  /** Optional override to control open state externally */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AssistantLauncher({
  isOpen: controlledIsOpen,
  onOpenChange,
}: AssistantLauncherProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleOpen = () => {
    if (onOpenChange) {
      onOpenChange(true);
    } else {
      setInternalIsOpen(true);
    }
  };

  const handleClose = () => {
    if (onOpenChange) {
      onOpenChange(false);
    } else {
      setInternalIsOpen(false);
    }
  };

  return (
    <>
      {/* 50x50 Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Open GigaLibs Assistant"
          title="Open GigaLibs Assistant (Development Preview)"
          className="fixed bottom-6 right-6 z-40 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-ui-button-inverted text-ui-fg-on-inverted shadow-2xl hover:bg-ui-button-inverted-hover transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-ui-border-interactive group"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="h-6 w-6 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ui-fg-interactive opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ui-fg-interactive" />
            </span>
          </div>
        </button>
      )}

      {/* Assistant Chat Drawer */}
      <GigaLibsAssistantDrawer isOpen={isOpen} onClose={handleClose} />
    </>
  );
}
