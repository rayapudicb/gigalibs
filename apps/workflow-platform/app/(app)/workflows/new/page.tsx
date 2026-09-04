'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkflowPipeline } from '@/lib/api-types'
import { requestJson } from '@/lib/client-api'

export default function NewWorkflowPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetApp, setTargetApp] = useState('')
  const [rootLabel, setRootLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const rootId = crypto.randomUUID()
      const workflow = await requestJson<WorkflowPipeline>('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          targetApp,
          definition: {
            nodes: [{ id: rootId, type: 'input', position: { x: 80, y: 160 }, data: { label: rootLabel } }],
            edges: [],
          },
        }),
      })
      router.replace(`/workflows/${encodeURIComponent(workflow.id)}/canvas`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create workflow.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/workflows" className="text-sm text-gray-400 hover:text-white">← Workflows</Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Create workflow</h1>
        <p className="mt-1 text-sm text-gray-400">Creates a persisted draft with a pass-through input node.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-gray-800 bg-gray-900 p-6">
        {error && <div role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
        <Field label="Name" value={name} onChange={setName} required />
        <Field label="Target application" value={targetApp} onChange={setTargetApp} required />
        <Field label="Root input label" value={rootLabel} onChange={setRootLabel} required />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Description</label>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-indigo-500" />
        </div>
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create draft'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-300">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={160} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-indigo-500" />
    </div>
  )
}
