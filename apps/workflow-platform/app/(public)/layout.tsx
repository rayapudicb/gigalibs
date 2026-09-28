import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'GigaLibs Dynamic Forms',
  description: 'Public interactive form and questionnaire portal powered by GigaLibs',
};

export default function PublicFormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </div>
      <footer className="py-6 text-center text-xs text-slate-500">
        <span>Powered by </span>
        <strong className="font-semibold text-slate-700">GigaLibs Sovereign Intelligence</strong>
      </footer>
    </div>
  );
}
