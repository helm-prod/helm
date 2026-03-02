'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  type RequestType,
  type Priority,
  REQUEST_TYPE_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/database'

export default function NewRequestPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [requestType, setRequestType] = useState<RequestType>('new_panel')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [adWeek, setAdWeek] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function handleSubmit(e: React.FormEvent) {
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

    const { error: insertError } = await supabase
      .from('work_requests')
      .insert({
        title,
        request_type: requestType,
        description: description || null,
        priority,
        ad_week: adWeek || null,
        due_date: dueDate || null,
        requester_id: user.id,
        status_history: [
          {
            from: null,
            to: 'submitted',
            changed_by: user.id,
            changed_at: new Date().toISOString(),
          },
        ],
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    router.push('/requests')
    router.refresh()
  }

  const inputClass =
    'w-full px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
  const labelClass = 'block text-sm font-medium text-brand-300 mb-1'

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Submit a Request</h1>
      <p className="text-brand-400 mb-8">
        Fill out the form below to submit a new production request.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-brand-900 border border-brand-800 rounded-xl p-6 space-y-5"
      >
        {/* Title */}
        <div>
          <label htmlFor="title" className={labelClass}>
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="e.g., WK32 Panel Update — Outdoor Living"
          />
        </div>

        {/* Request Type */}
        <div>
          <label htmlFor="requestType" className={labelClass}>
            Request Type <span className="text-red-400">*</span>
          </label>
          <select
            id="requestType"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as RequestType)}
            className={inputClass}
          >
            {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputClass}
          >
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Ad Week + Due Date row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="adWeek" className={labelClass}>
              Ad Week
            </label>
            <input
              id="adWeek"
              type="text"
              value={adWeek}
              onChange={(e) => setAdWeek(e.target.value)}
              className={inputClass}
              placeholder="e.g., WK32"
            />
          </div>
          <div>
            <label htmlFor="dueDate" className={labelClass}>
              Due Date
            </label>
            <input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className={labelClass}>
            Description
          </label>
          <textarea
            id="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            placeholder="Provide details about the request, special instructions, links, etc."
          />
        </div>

        {/* Error */}
        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-gold-400 hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 text-brand-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
