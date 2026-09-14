'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation, LanguageSelector } from '@/components/i18n';
import type { VerifiedSession } from '../../lib/verified-session';

export function UserNav({ session }: { session: VerifiedSession }) {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasPlatformAuthority = session.platformRoles.length > 0;
  const primaryPlatformRole = session.platformRoles[0];
  const primaryRole =
    primaryPlatformRole?.replaceAll('_', ' ') ??
    session.roles[0]?.replaceAll('_', ' ') ??
    'MEMBER';

  const userInitials = (session.user.name || session.user.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Close dropdown on click outside or Esc
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out could not be completed.');
      router.replace('/login');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex items-center gap-3" ref={dropdownRef}>
      {/* Platform Authority quick banner */}
      {hasPlatformAuthority && (
        <Link
          href="/platform-admin"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/20 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Platform Control Tower
        </Link>
      )}

      {/* User Avatar Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-ui-bg-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-ui-border-interactive cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-ui-fg-base text-ui-bg-base flex items-center justify-center font-semibold text-xs shadow-xs">
          {userInitials}
        </div>
        <div className="hidden md:flex flex-col text-left">
          <span className="text-xs font-semibold text-ui-fg-base leading-tight">
            {session.user.name || session.user.email.split('@')[0]}
          </span>
          <span className="text-[10px] text-ui-fg-muted font-mono leading-tight">
            {primaryRole}
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-ui-fg-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-ui-border-base bg-ui-bg-base p-1.5 shadow-xl shadow-black/5 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
          {/* User Details Header */}
          <div className="p-2.5 border-b border-ui-border-base">
            <p className="text-xs font-semibold text-ui-fg-base truncate">
              {session.user.name || 'User'}
            </p>
            <p className="text-[11px] text-ui-fg-muted truncate font-mono mt-0.5">
              {session.user.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {primaryPlatformRole && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  {primaryPlatformRole}
                </span>
              )}
              {session.roles[0] && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {session.roles[0]}
                </span>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <div className="py-1 space-y-0.5 border-b border-ui-border-base">
            {hasPlatformAuthority && (
              <>
                <Link
                  href="/platform-admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
                >
                  <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  <span>{t('platformControlTower')}</span>
                </Link>
                <Link
                  href="/platform-admin/users"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
                >
                  <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" />
                  </svg>
                  <span>{t('platformUsersRbac')}</span>
                </Link>
              </>
            )}

            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
            >
              <svg className="w-4 h-4 text-ui-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{t('profileAndPassword')}</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
            >
              <svg className="w-4 h-4 text-ui-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{t('workspaceSettings')}</span>
            </Link>

            <Link
              href="/select-tenant"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-ui-fg-base hover:bg-ui-bg-subtle transition-colors"
            >
              <svg className="w-4 h-4 text-ui-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>{t('switchWorkspace')}</span>
            </Link>
          </div>

          {/* Language Selection row for Internal Users */}
          <div className="px-2.5 py-2 border-b border-ui-border-base bg-ui-bg-subtle/40 rounded-md my-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ui-fg-muted">
                Language / Idioma
              </span>
            </div>
            <LanguageSelector className="w-full text-xs" showDirectionBadge={true} />
          </div>

          {/* Sign out */}
          <div className="pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void logout()}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 text-left cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>{busy ? 'Signing out…' : t('logout')}</span>
            </button>
            {error && (
              <p className="px-2.5 py-1 text-[11px] text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
