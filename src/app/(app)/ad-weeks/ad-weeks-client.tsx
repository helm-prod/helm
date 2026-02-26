'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function AdWeekCreateButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weekNumber, setWeekNumber] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [label, setLabel] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in.')
      setLoading(false)
      return
    }

    const wn = parseInt(weekNumber)
    const yr = parseInt(year)

    if (!wn || wn < 1 || wn > 53) {
      setError('Week number must be between 1 and 53.')
      setLoading(false)
      return
    }

    const autoLabel = label || `WK ${wn}`

    const { data, error: insertError } = await supabase
      .from('ad_weeks')
      .insert({
        week_number: wn,
        year: yr,
        label: autoLabel,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setOpen(false)
    setLoading(false)
    setWeekNumber('')
    setLabel('')
    router.push(`/ad-weeks/${data.id}`)
    router.refresh()
  }

  const inputClass =
    'w-full px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 bg-nex-red hover:bg-nex-redDark text-white text-sm font-medium rounded-lg transition-colors"
      >
        + Create Ad Week
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form
        onSubmit={handleCreate}
        className="bg-brand-900 border border-brand-800 rounded-xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold text-white">Create Ad Week</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-300 mb-1">
              Week Number <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              required
              min={1}
              max={53}
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              className={inputClass}
              placeholder="e.g., 6"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-300 mb-1">
              Year <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              required
              min={2020}
              max={2099}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-300 mb-1">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
            placeholder={weekNumber ? `WK ${weekNumber}` : 'e.g., WK 6'}
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-nex-red hover:bg-nex-redDark disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
            className="px-5 py-2.5 text-brand-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
