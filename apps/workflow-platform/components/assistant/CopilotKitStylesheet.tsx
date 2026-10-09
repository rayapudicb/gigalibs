'use client';

import { useEffect } from 'react';

const COMPOSER_OVERRIDE_CSS = `
/* GigaLibs Sovereign AI Assistant - Composer Container & Send Button Styling */
[data-copilotkit] textarea,
[data-copilotkit] [data-testid="copilot-chat-textarea"] {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background: transparent !important;
  resize: none !important;
  font-size: 0.875rem !important;
  line-height: 1.5 !important;
  color: #0f172a !important;
  padding: 0.75rem 1rem !important;
}

[data-copilotkit] textarea::placeholder,
[data-copilotkit] [data-testid="copilot-chat-textarea"]::placeholder {
  color: #94a3b8 !important;
}

[data-copilotkit] form,
[data-copilotkit] [data-slot="input-container"],
[data-copilotkit] [data-testid="copilot-chat-input"],
[data-copilotkit] .copilotKitInput {
  border: 1.5px solid #cbd5e1 !important;
  border-radius: 1.5rem !important;
  background-color: #ffffff !important;
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.08), 0 1px 3px -1px rgba(0, 0, 0, 0.06) !important;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important;
}

[data-copilotkit] form:focus-within,
[data-copilotkit] [data-slot="input-container"]:focus-within,
[data-copilotkit] [data-testid="copilot-chat-input"]:focus-within,
[data-copilotkit] .copilotKitInput:focus-within,
[data-copilotkit] div:has(> textarea):focus-within {
  border-color: #167a55 !important;
  box-shadow: 0 0 0 3px rgba(22, 122, 85, 0.18), 0 2px 8px -1px rgba(0, 0, 0, 0.08) !important;
}

[data-copilotkit] [data-testid="copilot-add-menu-button"] {
  width: 32px !important;
  height: 32px !important;
  border-radius: 9999px !important;
  color: #64748b !important;
  background: transparent !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.15s ease-in-out !important;
}

[data-copilotkit] [data-testid="copilot-add-menu-button"]:hover:not(:disabled) {
  color: #0f172a !important;
  background-color: #f1f5f9 !important;
}

[data-copilotkit] button[type="submit"],
[data-copilotkit] [data-testid="copilot-send-button"] {
  width: 34px !important;
  height: 34px !important;
  border-radius: 9999px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.15s ease-in-out !important;
  border: none !important;
}

[data-copilotkit] button[type="submit"]:not(:disabled),
[data-copilotkit] [data-testid="copilot-send-button"]:not(:disabled) {
  background-color: #167a55 !important;
  color: #ffffff !important;
  cursor: pointer !important;
  opacity: 1 !important;
}

[data-copilotkit] button[type="submit"]:hover:not(:disabled),
[data-copilotkit] [data-testid="copilot-send-button"]:hover:not(:disabled) {
  background-color: #126345 !important;
  transform: scale(1.05);
}

[data-copilotkit] button[type="submit"]:not(:disabled) svg,
[data-copilotkit] [data-testid="copilot-send-button"]:not(:disabled) svg {
  color: #ffffff !important;
  stroke: #ffffff !important;
}

[data-copilotkit] button[type="submit"]:disabled,
[data-copilotkit] [data-testid="copilot-send-button"]:disabled {
  background-color: #e2e8f0 !important;
  color: #94a3b8 !important;
  cursor: not-allowed !important;
  opacity: 0.6 !important;
}

[data-copilotkit] button[type="submit"]:disabled svg,
[data-copilotkit] [data-testid="copilot-send-button"]:disabled svg {
  color: #94a3b8 !important;
  stroke: #94a3b8 !important;
}
`;

/**
 * Dynamically injects the CopilotKit sovereign stylesheet and inline composer styles into document.head
 * on client mount to guarantee immediate, crisp rounded outline and interactive send button styling.
 */
export function CopilotKitStylesheet() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!document.getElementById('gigalibs-copilotkit-css')) {
      const link = document.createElement('link');
      link.id = 'gigalibs-copilotkit-css';
      link.rel = 'stylesheet';
      link.setAttribute('href', ['/', 'copilotkit.css'].join(''));
      document.head.appendChild(link);
    }

    if (!document.getElementById('gigalibs-assistant-composer-style')) {
      const style = document.createElement('style');
      style.id = 'gigalibs-assistant-composer-style';
      style.innerHTML = COMPOSER_OVERRIDE_CSS;
      document.head.appendChild(style);
    }
  }, []);

  return null;
}
