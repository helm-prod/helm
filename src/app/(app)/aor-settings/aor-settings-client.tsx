'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PANEL_CATEGORIES, type PanelCategory } from '@/lib/types/database'

interface Assignment {
  id: string
  producer_id: string
  category: string
  loe: number
  producer: { id: string; full_name: string; email: string } | null
}

interface Props {
  assignments: Assignment[]
  producers: { id: string; full_name: string; email: string }[]
}

interface CategoryRow {
  category: PanelCategory
  assignmentId: string | null
  producerId: string
  dirty: boolean
}

export function AorSettingsClient({ assignments, producers }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Build initial rows from all categories
  const assignMap: Record<string, Assignment> = {}
  for (const a of assignments) {
    assignMap[a.category] = a
  }

  const initialRows: CategoryRow[] = PANEL_CATEGORIES.map((cat) => {
    const existing = assignMap[cat]
    return {
      category: cat,
      assignmentId: existing?.id ?? null,
      producerId: existing?.producer_id ?? '',
      dirty: false,
    }
  })

  const [rows, setRows] = useState(initialRows)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function updateRow(category: string, field: 'producerId', value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.category === category
          ? { ...r, [field]: value, dirty: true }
          : r
      )
    )
    setSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)

    const dirtyRows = rows.filter((r) => r.dirty)

    for (const row of dirtyRows) {
      if (!row.producerId) {
        // Delete existing assignment if producer cleared
        if (row.assignmentId) {
          const { error: deleteError } = await supabase
            .from('aor_assignments')
            .delete()
            .eq('id', row.assignmentId)
          if (deleteError) {
            setError(`Failed to clear ${row.category}: ${deleteError.message}`)
            setSaving(false)
            return
          }
        }
        continue
      }

      if (row.assignmentId) {
        // Update existing
        const { error: updateError } = await supabase
          .from('aor_assignments')
          .update({
            producer_id: row.producerId,
          })
          .eq('id', row.assignmentId)

        if (updateError) {
          setError(`Failed to update ${row.category}: ${updateError.message}`)
          setSaving(false)
          return
        }
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('aor_assignments')
          .insert({
            producer_id: row.producerId,
            category: row.category,
            loe: 1,
          })

        if (insertError) {
          setError(`Failed to assign ${row.category}: ${insertError.message}`)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    setSuccess(true)
    setRows((prev) => prev.map((r) => ({ ...r, dirty: false })))
    router.refresh()
  }

  const hasDirty = rows.some((r) => r.dirty)
  const unassignedCount = rows.filter((r) => !r.producerId).length

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AOR Settings</h1>
          <p className="text-brand-400 mt-1">
            Manage Area of Responsibility — assign categories to producers.
          </p>
          {unassignedCount > 0 && (
            <p className="text-orange-400 text-sm mt-1">
              {unassignedCount} unassigned categor{unassignedCount !== 1 ? 'ies' : 'y'}
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasDirty}
          className="px-5 py-2.5 bg-nex-red hover:bg-nex-redDark disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-lg p-3 mb-4">
          Changes saved successfully.
        </div>
      )}

      <div className="bg-brand-900 border border-brand-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-800 text-brand-400">
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Assigned Producer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-800/50">
              {rows.map((row) => (
                <tr
                  key={row.category}
                  className={`transition-colors ${
                    !row.producerId
                      ? 'bg-orange-500/5'
                      : row.dirty
                      ? 'bg-brand-800/20'
                      : 'hover:bg-brand-800/30'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className={`font-medium ${!row.producerId ? 'text-orange-300' : 'text-white'}`}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.producerId}
                      onChange={(e) => updateRow(row.category, 'producerId', e.target.value)}
                      className="w-full px-3 py-1.5 bg-brand-800 border border-brand-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Unassigned</option>
                      {producers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
