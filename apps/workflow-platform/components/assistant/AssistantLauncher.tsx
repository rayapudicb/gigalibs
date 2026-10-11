import Link from 'next/link';
import { Bot } from 'lucide-react';

/** Preview-only launcher. The former drawer rendered fabricated business-action cards. */
export function AssistantLauncher() {
  return (
    <Link
      href="/assistant"
      aria-label="Open GigaLibs Assistant development preview"
      title="Assistant development preview"
      className="fixed bottom-6 left-6 z-40 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-ui-button-inverted text-ui-fg-on-inverted shadow-2xl hover:bg-ui-button-inverted-hover focus:outline-none focus:ring-2 focus:ring-ui-border-interactive print:hidden"
    >
      <Bot className="h-6 w-6" aria-hidden="true" />
    </Link>
  );
}
