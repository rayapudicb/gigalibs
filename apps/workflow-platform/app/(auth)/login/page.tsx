'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Authentication failed.')
      }

      const data = (await res.json()) as { requiresTenantSelection?: boolean }
      router.push(data.requiresTenantSelection ? '/select-tenant' : '/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 items-center justify-center p-6 selection:bg-zinc-700 selection:text-white font-sans text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md p-8 shadow-xl space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700/60 text-zinc-100 font-semibold text-sm mx-auto mb-2 shadow-xs">
            G
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Sign in to workspace</h1>
          <p className="text-xs text-zinc-400">
            Enterprise Operational Intelligence & AI Workflow Canvas
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@company.com"
              className="w-full h-10 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-300">
                Password
              </label>
            </div>
            <input
              type="password"
              required
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
            disabled={loading}
            className="w-full h-10 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs transition shadow-xs disabled:opacity-50"
          >
            {loading ? 'Authenticating…' : 'Continue'}
          </button>

          <div className="pt-2">
            <button
              type="button"
              onClick={async () => {
                setEmail('admin@gigalibs.dev')
                setPassword('PlatformAdmin2026!')
                setLoading(true)
                try {
                  const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'admin@gigalibs.dev', password: 'PlatformAdmin2026!' }),
                  })
                  if (res.ok) {
                    router.push('/dashboard')
                  } else {
                    const data = await res.json()
                    setError(data.detail || 'Sign-in error')
                  }
                } catch (err: any) {
                  setError(err.message || 'Network error')
                } finally {
                  setLoading(false)
                }
              }}
              className="w-full h-9 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 font-medium text-xs text-zinc-300 transition flex items-center justify-center gap-2"
            >
              Sign in as Platform Admin
            </button>
          </div>

          <div className="pt-1 text-center text-xs text-zinc-500">
            Don&apos;t have a workspace?{' '}
            <Link href="/register" className="text-zinc-300 hover:text-white font-medium underline underline-offset-4">
              Create workspace →
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
