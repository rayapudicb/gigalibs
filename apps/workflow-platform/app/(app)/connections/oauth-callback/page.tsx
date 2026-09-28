'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  useEffect(() => {
    if (error) {
      setStatus('error');
      setErrorDetails(searchParams.get('error_description') || error);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorDetails('No authorization code provided in the callback URL.');
      return;
    }

    // Attempt token exchange via BFF
    void fetch('/api/connectors-hub/oauth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Token exchange failed with status ${res.status}`);
        }
        return res.json();
      })
      .then(() => {
        setStatus('success');
        setTimeout(() => {
          router.replace('/connections/oauth-studio');
        }, 2000);
      })
      .catch((err: any) => {
        setStatus('error');
        setErrorDetails(err.message || 'Failed to exchange authorization code.');
      });
  }, [code, state, error, router, searchParams]);

  return (
    <div className="max-w-xl mx-auto my-16 p-8 rounded-xl border border-ui-border-base bg-ui-bg-base text-center shadow-elevation-card-rest space-y-4">
      {status === 'exchanging' && (
        <div className="space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent align-[-0.125em]" />
          <h2 className="text-lg font-bold text-ui-fg-base">Exchanging OAuth Authorization Code</h2>
          <p className="text-xs text-ui-fg-muted font-mono">Connecting credentials to secure vault...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-3">
          <div className="text-3xl">✓</div>
          <h2 className="text-lg font-bold text-emerald-700">Connection Established Successfully</h2>
          <p className="text-xs text-ui-fg-muted">Redirecting you to OAuth Studio...</p>
          <Link
            href="/connections/oauth-studio"
            className="inline-block mt-2 px-4 py-2 rounded-lg bg-ui-fg-base text-ui-bg-base text-xs font-semibold"
          >
            Return to OAuth Studio Now →
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <div className="text-3xl text-red-600">⚠</div>
          <h2 className="text-lg font-bold text-red-700">OAuth Exchange Failed</h2>
          <p className="text-xs text-red-600 font-mono bg-red-50 p-3 rounded-lg border border-red-200">
            {errorDetails}
          </p>
          <Link
            href="/connections/oauth-studio"
            className="inline-block mt-2 px-4 py-2 rounded-lg bg-ui-fg-base text-ui-bg-base text-xs font-semibold"
          >
            ← Return to OAuth Studio
          </Link>
        </div>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-ui-fg-muted">Loading authentication state...</div>}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
