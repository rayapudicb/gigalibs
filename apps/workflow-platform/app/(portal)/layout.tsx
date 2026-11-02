import type { Metadata } from 'next';
import type React from 'react';

// WI-OI-140 M-REQ: the public request portal (no sign-in). The link capability lives in the URL fragment, which
// browsers never send to a server; no referrer leaves these pages.
export const metadata: Metadata = {
  title: 'Report a problem',
  description: 'Tell maintenance about a problem with this equipment.',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ui-bg-subtle text-ui-fg-base antialiased">
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  );
}
