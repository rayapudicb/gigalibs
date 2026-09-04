'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { OnboardingManager } from '@gigalibs/onboarding-flow'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1: User Credentials
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Step 2: Organization, Subdomain & DB Isolation
  const [companyName, setCompanyName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [isolationMode, setIsolationMode] = useState<'ROW_LEVEL_SECURITY' | 'SCHEMA_ISOLATED'>('ROW_LEVEL_SECURITY')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live computed subdomain slug
  const activeSlug = customSlug.trim()
    ? OnboardingManager.sanitizeSlug(customSlug)
    : OnboardingManager.sanitizeSlug(companyName || 'acme')

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) {
      setError('Please complete all personal credential fields.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName) {
      setError('Company name is required.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          companyName,
          slug: activeSlug,
          isolationMode,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to create workspace.')
      }

      const data = await res.json()
      router.push(data.redirectUrl || '/dashboard')
    } catch (err: any) {
      setError(err.message || 'Registration error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 items-center justify-center p-6 selection:bg-zinc-700 selection:text-white font-sans text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md p-8 shadow-xl space-y-6">
        {/* Header with Medusa Monogram */}
        <div className="space-y-1.5 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700/60 text-zinc-100 font-semibold text-sm mx-auto mb-2 shadow-xs">
            G
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Create your workspace
          </h1>
          <p className="text-xs text-zinc-400">
            Self-service onboarding with dedicated database isolation & local subdomain
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              step === 1 ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            1. Admin Credentials
          </button>
          <span className="text-zinc-600">→</span>
          <button
            type="button"
            onClick={() => {
              if (name && email && password) setStep(2)
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              step === 2 ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            2. Workspace & DB
          </button>
        </div>

        {/* Form */}
        {step === 1 ? (
          <form onSubmit={handleNextStep} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sarah Connor"
                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@company.com"
                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300 font-normal">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full h-10 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs transition shadow-xs"
            >
              Continue to Workspace Setup →
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Company / Organization Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Apex Federal Solutions"
                className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Workspace Subdomain
              </label>
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition">
                <input
                  type="text"
                  value={customSlug || activeSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder="apex-fed"
                  className="w-full h-10 bg-transparent outline-none text-zinc-100 placeholder:text-zinc-600"
                />
                <span className="text-zinc-500 font-mono text-[11px] whitespace-nowrap pl-1">
                  .localhost:3000
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">
                Production URL: https://{activeSlug}.gigalibs.dev
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Database Isolation Architecture
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsolationMode('ROW_LEVEL_SECURITY')}
                  className={`p-2.5 text-left rounded-xl border text-xs transition ${
                    isolationMode === 'ROW_LEVEL_SECURITY'
                      ? 'border-zinc-400 bg-zinc-800 text-white font-medium'
                      : 'border-zinc-800/80 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200">RLS Partitioning</div>
                  <div className="text-[10px] text-zinc-500">Shared DB, Row-Level Isolation</div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsolationMode('SCHEMA_ISOLATED')}
                  className={`p-2.5 text-left rounded-xl border text-xs transition ${
                    isolationMode === 'SCHEMA_ISOLATED'
                      ? 'border-zinc-400 bg-zinc-800 text-white font-medium'
                      : 'border-zinc-800/80 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold text-zinc-200">Schema Isolated</div>
                  <div className="text-[10px] text-zinc-500">Dedicated schema per tenant</div>
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300 font-normal">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 h-10 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 font-medium text-xs border border-zinc-700/60 transition"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 h-10 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs transition shadow-xs disabled:opacity-50"
              >
                {loading ? 'Provisioning DB…' : 'Provision & Launch 🚀'}
              </button>
            </div>
          </form>
        )}

        {/* Footer Link */}
        <div className="pt-2 text-center text-xs text-zinc-500">
          Already have a workspace?{' '}
          <Link href="/login" className="text-zinc-300 hover:text-white font-medium underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
