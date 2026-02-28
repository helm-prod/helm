'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

interface ProfileOption {
  id: string
  full_name: string
  email: string
}

interface MappingRow {
  id: string
  profile_id: string
  category_label: string
  url_patterns: string[]
  is_homepage: boolean
  profiles?: {
    full_name: string | null
    email: string | null
  } | null
}

interface FormState {
  profileId: string
  categoryLabel: string
  urlPatternsInput: string
  isHomepage: boolean
}

interface Props {
  profiles: ProfileOption[]
}

function buildDefaultForm(profiles: ProfileOption[]): FormState {
  return {
    profileId: profiles[0]?.id ?? '',
    categoryLabel: '',
    urlPatternsInput: '',
    isHomepage: false,
  }
}

function parsePatterns(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function Ga4Mapping({ profiles }: Props) {
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<FormState>(() => buildDefaultForm(profiles))

  useEffect(() => {
    setForm(buildDefaultForm(profiles))
  }, [profiles])

  const profileLookup = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]))
  }, [profiles])

  const fetchMappings = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ga4/aor', { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to load mappings')
      }

      const payload = (await response.json()) as { data?: MappingRow[] }
      const normalized = (payload.data ?? []).map((row) => ({
        ...row,
        url_patterns: Array.isArray(row.url_patterns) ? row.url_patterns : [],
        is_homepage: Boolean(row.is_homepage),
      }))

      setMappings(normalized)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load mappings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  function resetForms() {
    setEditingId(null)
    setShowAddForm(false)
    setForm(buildDefaultForm(profiles))
  }

  function startEditing(row: MappingRow) {
    setShowAddForm(false)
    setEditingId(row.id)
    setForm({
      profileId: row.profile_id,
      categoryLabel: row.category_label,
      urlPatternsInput: row.url_patterns.join('\n'),
      isHomepage: row.is_homepage,
    })
  }

  async function saveForm() {
    if (!form.profileId || !form.categoryLabel.trim()) {
      setError('Producer and category label are required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        id: editingId ?? undefined,
        profile_id: form.profileId,
        category_label: form.categoryLabel.trim(),
        url_patterns: parsePatterns(form.urlPatternsInput),
        is_homepage: form.isHomepage,
      }

      const method = editingId ? 'PUT' : 'POST'
      const response = await fetch('/api/ga4/aor', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to save mapping')
      }

      await fetchMappings()
      resetForms()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save mapping')
    } finally {
      setSaving(false)
    }
  }

  async function deleteMapping(id: string) {
    const confirmed = window.confirm('Delete this GA4 mapping?')
    if (!confirmed) return

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/ga4/aor?id=${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Failed to delete mapping')
      }

      await fetchMappings()
      if (editingId === id) {
        resetForms()
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete mapping')
    } finally {
      setSaving(false)
    }
  }

  function renderForm() {
    return (
      <div className="rounded-xl border border-[#1a3a4a] bg-brand-900/70 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm text-brand-300">
            Producer
            <select
              value={form.profileId}
              onChange={(event) => setForm((prev) => ({ ...prev, profileId: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-[#1a3a4a] bg-[#0d2137] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select producer</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-brand-300">
            Category Label
            <input
              value={form.categoryLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, categoryLabel: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-[#1a3a4a] bg-[#0d2137] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Electronics"
            />
          </label>
        </div>

        <label className="mt-3 block text-sm text-brand-300">
          URL Patterns (one per line)
          <textarea
            value={form.urlPatternsInput}
            onChange={(event) => setForm((prev) => ({ ...prev, urlPatternsInput: event.target.value }))}
            className="mt-1 min-h-24 w-full rounded-lg border border-[#1a3a4a] bg-[#0d2137] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="/browse/electronics/"
          />
        </label>

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-brand-200">
          <input
            type="checkbox"
            checked={form.isHomepage}
            onChange={(event) => setForm((prev) => ({ ...prev, isHomepage: event.target.checked }))}
            className="h-4 w-4 rounded border-brand-600 bg-[#0d2137]"
          />
          Is Homepage
        </label>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={saveForm}
            disabled={saving}
            className="rounded-lg bg-nex-red px-4 py-2 text-sm font-medium text-white hover:bg-nex-redDark disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={resetForms}
            disabled={saving}
            className="rounded-lg border border-brand-700 px-4 py-2 text-sm text-brand-200 hover:bg-brand-800/50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setShowAddForm(true)
            setForm(buildDefaultForm(profiles))
          }}
          className="rounded-lg border border-brand-700 px-3 py-1.5 text-sm text-brand-200 hover:bg-brand-800/50"
        >
          Add Mapping
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {showAddForm ? renderForm() : null}

      <div className="overflow-x-auto rounded-xl border border-brand-800 bg-brand-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-brand-800 text-left text-xs uppercase tracking-wide text-[#4a9ead]">
              <th className="px-4 py-3">Producer</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">URL Patterns</th>
              <th className="px-4 py-3">Homepage</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-brand-400">
                  Loading mappings...
                </td>
              </tr>
            ) : mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-brand-500">
                  No mappings yet.
                </td>
              </tr>
            ) : (
              mappings.map((row) => {
                if (editingId === row.id) {
                  return (
                    <tr key={row.id}>
                      <td colSpan={5} className="px-4 py-4">
                        {renderForm()}
                      </td>
                    </tr>
                  )
                }

                const producer = row.profiles?.full_name || profileLookup.get(row.profile_id)?.full_name || 'Unknown'

                return (
                  <tr key={row.id} className="border-b border-brand-800/60 hover:bg-[#0d2137]">
                    <td className="px-4 py-3 text-white">{producer}</td>
                    <td className="px-4 py-3 text-white">{row.category_label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.url_patterns.map((pattern) => (
                          <span
                            key={`${row.id}-${pattern}`}
                            className="rounded-md border border-[#1a3a4a] bg-[#0d2137] px-2 py-0.5 text-xs text-brand-200"
                          >
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white">{row.is_homepage ? '☑' : '☐'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(row)}
                          className="rounded border border-brand-700 px-2 py-1 text-xs text-brand-200 hover:bg-brand-800/50"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMapping(row.id)}
                          className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
