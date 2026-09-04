'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface TenantOption {
  id: string
  name: string
  slug: string
  region: string
  membershipRole: string
}

export default function SelectTenantPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const response = await fetch('/api/auth/tenants', { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.detail || 'Unable to load tenant memberships.')
        }
        if (!Array.isArray(payload)) {
          throw new Error('Tenant service returned an invalid response.')
        }
        setTenants(payload)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load tenants.')
      } finally {
        setLoading(false)
      }
    }
    void loadTenants()
  }, [])

  const selectTenant = async (tenantId: string) => {
    setSelectingId(tenantId)
    setError(null)
    try {
      const response = await fetch('/api/auth/select-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.detail || 'Unable to select tenant.')
      }
      router.push('/dashboard')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to select tenant.')
      setSelectingId(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">Select your workspace</h1>
        <p className="mt-2 text-sm text-gray-400">
          Access is limited to organizations where your membership is active.
        </p>

        {loading && <p className="mt-8 text-sm text-gray-400">Loading authorized organizations…</p>}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-800/40 bg-rose-950/40 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {!loading && tenants.length === 0 && !error && (
          <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950 p-6">
            <p className="text-sm font-medium text-white">No active tenant membership was found.</p>
            <p className="mt-1 text-sm text-gray-500">
              Ask a tenant administrator to invite you before accessing operational data.
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              disabled={selectingId !== null}
              onClick={() => void selectTenant(tenant.id)}
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950 p-4 text-left transition hover:border-indigo-600 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-semibold text-white">{tenant.name}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  {tenant.slug} · {tenant.region} · {tenant.membershipRole}
                </span>
              </span>
              <span className="text-sm text-indigo-400">
                {selectingId === tenant.id ? 'Opening…' : 'Open →'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
