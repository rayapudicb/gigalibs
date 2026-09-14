'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function AccountForm({
  register = false,
  ssoError,
}: {
  register?: boolean;
  ssoError?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(register ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fields.get('email'),
          password: fields.get('password'),
          ...(register ? { name: fields.get('name') } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.authenticated !== true) {
        throw new Error(payload.detail || 'The request could not be completed.');
      }
      router.replace(
        payload.requiresTenantSelection
          ? '/select-tenant'
          : payload.requiresMfa
            ? '/mfa'
            : '/modules',
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The sign-in service is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] mx-auto">
      {/* Logo mark */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-ui-fg-base flex items-center justify-center mb-4 shadow-md">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-ui-fg-base tracking-tight">
          {register ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-sm text-ui-fg-subtle mt-1">
          {register ? 'Sign up to get started with GigaLibs' : 'Sign in to your GigaLibs workspace'}
        </p>
      </div>

      {/* Main card */}
      <div className="bg-ui-bg-base border border-ui-border-base rounded-xl shadow-elevation-card-rest overflow-hidden">
        {/* SSO error banner */}
        {!register && ssoError && (
          <div className="px-6 pt-5">
            <div
              className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {ssoError === 'workspace'
                ? 'Enter a valid workspace slug to use organization SSO.'
                : ssoError === 'rejected'
                  ? 'The identity provider could not authorize this account. Start a new sign-in or contact your workspace administrator.'
                  : 'Organization SSO is unavailable. Verify the workspace and provider configuration or try again later.'}
            </div>
          </div>
        )}

        {/* Form body */}
        <form onSubmit={(e) => void submit(e)} className="px-6 py-6 space-y-4">
          {register && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                placeholder="Jane Smith"
                className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ui-fg-base" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@company.com"
              className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-ui-fg-base" htmlFor="password">
                Password
              </label>
              {register && <span className="text-xs text-ui-fg-muted">12–128 characters</span>}
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={register ? 12 : 1}
              maxLength={128}
              placeholder={register ? 'Create a strong password' : '••••••••••••'}
              className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
            />
          </div>

          {error && (
            <div
              className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            disabled={busy}
            type="submit"
            className="w-full h-9 rounded-lg bg-ui-fg-base text-ui-bg-base text-sm font-medium hover:bg-ui-fg-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-1"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  aria-hidden="true"
                  className="animate-spin h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Please wait…
              </span>
            ) : register ? (
              'Create account'
            ) : (
              'Continue'
            )}
          </button>
        </form>

        {/* SSO section — login only */}
        {!register && (
          <>
            <div className="relative px-6">
              <div className="absolute inset-0 flex items-center px-6">
                <div className="w-full border-t border-ui-border-base" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-ui-bg-base px-3 text-xs text-ui-fg-muted">or</span>
              </div>
            </div>

            <form action="/api/auth/oidc/start" method="get" className="px-6 py-5 space-y-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-ui-fg-base" htmlFor="tenant-slug">
                  Continue with SSO
                </label>
                <input
                  id="tenant-slug"
                  name="tenant"
                  required
                  minLength={2}
                  maxLength={63}
                  pattern="[a-z0-9][a-z0-9-]{1,62}"
                  autoComplete="organization"
                  placeholder="your-workspace"
                  className="block w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:ring-2 focus:ring-ui-border-interactive focus:border-transparent transition"
                />
              </div>
              <button
                type="submit"
                className="w-full h-9 rounded-lg border border-ui-border-base bg-ui-bg-base text-ui-fg-base text-sm font-medium hover:bg-ui-bg-base-hover hover:border-ui-border-strong transition-colors"
              >
                Continue with SSO
              </button>
              <p className="text-xs text-ui-fg-muted">
                Your workspace must have a verified domain and an enabled OIDC provider.
              </p>
            </form>
          </>
        )}

        {/* Footer */}
        <div className="border-t border-ui-border-base px-6 py-4 bg-ui-bg-subtle">
          <p className="text-center text-sm text-ui-fg-muted">
            {register ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              href={register ? '/login' : '/register'}
              className="font-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors underline underline-offset-2"
            >
              {register ? 'Sign in' : 'Create one'}
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-ui-fg-muted mt-6">
        Your session and workspace access are verified by the control plane.
      </p>
    </div>
  );
}
