'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { I18nProvider } from './context';

export interface AppI18nProviderProps {
  initialLocale?: string;
  children: React.ReactNode;
}

export function AppI18nProvider({
  initialLocale = 'en-US',
  children,
}: AppI18nProviderProps): React.JSX.Element {
  const pathname = usePathname() || '';

  // Constraint: Platform Admin is strictly ALWAYS English (en-US)
  const isPlatformAdmin = pathname === '/platform-admin' || pathname.startsWith('/platform-admin/');
  const forcedLocale = isPlatformAdmin ? 'en-US' : undefined;

  const handleLocaleChange = async (newLocale: string) => {
    try {
      await fetch('/api/user/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch {
      // Non-blocking cookie update failure
    }
  };

  return (
    <I18nProvider
      initialLocale={initialLocale}
      forcedLocale={forcedLocale}
      onLocaleChange={handleLocaleChange}
    >
      {children}
    </I18nProvider>
  );
}
