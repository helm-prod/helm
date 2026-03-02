'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  type Profile,
  type WorkRequest,
  type RequestType,
  type Priority,
  type RequestStatus,
  type StatusHistoryEntry,
  REQUEST_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '@/lib/types/database'
import { StatusBadge } from '@/components/status-badge'
import { PriorityBadge } from '@/components/priority-badge'

interface Props {
  request: WorkRequest & { requester: Profile; assignee: Profile | null }
  profile: Profile
  producers: { id: string; full_name: string }[]
}

export function RequestDetailClient({ request: initial, profile, producers }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const canEdit =
    profile.role === 'admin' ||
    profile.role === 'producer' ||
    profile.role === 'senior_web_producer'
  const isOwnSubmitted =
    initial.requester_id === profile.id && initial.status === 'submitted'
  const editable = canEdit || isOwnSubmitted

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [request, setRequest] = useState(initial)

  // Edit form state
  const [title, setTitle] = useState(request.title)
  const [requestType, setRequestType] = useState(request.request_type)
  const [description, setDescription] = useState(request.description ?? '')
  const [priority, setPriority] = useState(request.priority)
  const [adWeek, setAdWeek] = useState(request.ad_week ?? '')
  const [dueDate, setDueDate] = useState(request.due_date ?? '')
  const [assignedTo, setAssignedTo] = useState(request.assigned_to ?? '')
  const [notes, setNotes] = useState(request.notes ?? '')

  async function handleSave() {
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('work_requests')
      .update({
        title,
        request_type: requestType,
        description: description || null,
        priority,
        ad_week: adWeek || null,
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
        notes: notes || null,
      })
      .eq('id', request.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setEditing(false)
    setSaving(false)
    router.refresh()
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const inputClass =
    'w-full px-3 py-2 bg-brand-800 border border-brand-700 rounded-lg text-white placeholder-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
  const labelClass = 'text-sm font-medium text-brand-400'

  const statusHistory: StatusHistoryEntry[] = request.status_history ?? []

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/requests"
            className="text-sm text-brand-500 hover:text-brand-300 transition-colors mb-2 inline-block"
          >
            &larr; Back to Requests
          </Link>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} text-xl font-bold mt-1`}
            />
          ) : (
            <h1 className="text-2xl font-bold text-white">{request.title}</h1>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {editable && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 text-sm bg-brand-800 hover:bg-brand-700 text-white rounded-lg transition-colors border border-brand-700"
            >
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-brand-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-gold-400 hover:bg-gold-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-brand-900 border border-brand-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-3">
              Description
            </h2>
            {editing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className={inputClass}
              />
            ) : (
              <p className="text-brand-300 text-sm whitespace-pre-wrap">
                {request.description || 'No description provided.'}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-brand-900 border border-brand-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-3">Notes</h2>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className={inputClass}
                placeholder="Add notes or comments..."
              />
            ) : (
              <p className="text-brand-300 text-sm whitespace-pre-wrap">
                {request.notes || 'No notes yet.'}
              </p>
            )}
          </div>

          {/* Status History */}
          <div className="bg-brand-900 border border-brand-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-3">
              Status History
            </h2>
            {statusHistory.length === 0 ? (
              <p className="text-brand-500 text-sm">No status changes yet.</p>
            ) : (
              <div className="space-y-3">
                {statusHistory.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                    <span className="text-brand-400">
                      {entry.from
                        ? `${STATUS_LABELS[entry.from]} → ${STATUS_LABELS[entry.to]}`
                        : `Set to ${STATUS_LABELS[entry.to]}`}
                    </span>
                    <span className="text-brand-600 text-xs">
                      {formatDateTime(entry.changed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar details */}
        <div className="space-y-6">
          <div className="bg-brand-900 border border-brand-800 rounded-xl p-6 space-y-4">
            {/* Status */}
            <div>
              <p className={labelClass}>Status</p>
              <div className="mt-1">
                <StatusBadge
                  status={request.status}
                  requestId={request.id}
                  canEdit={canEdit}
                  currentUserId={profile.id}
                  statusHistory={statusHistory}
                  onUpdate={() => router.refresh()}
                />
              </div>
            </div>

            {/* Request Type */}
            <div>
              <p className={labelClass}>Request Type</p>
              {editing ? (
                <select
                  value={requestType}
                  onChange={(e) =>
                    setRequestType(e.target.value as RequestType)
                  }
                  className={`${inputClass} mt-1`}
                >
                  {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white text-sm mt-1">
                  {REQUEST_TYPE_LABELS[request.request_type as RequestType]}
                </p>
              )}
            </div>

            {/* Priority */}
            <div>
              <p className={labelClass}>Priority</p>
              {editing ? (
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className={`${inputClass} mt-1`}
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1">
                  <PriorityBadge priority={request.priority} />
                </div>
              )}
            </div>

            {/* Ad Week */}
            <div>
              <p className={labelClass}>Ad Week</p>
              {editing ? (
                <input
                  value={adWeek}
                  onChange={(e) => setAdWeek(e.target.value)}
                  className={`${inputClass} mt-1`}
                  placeholder="e.g., WK32"
                />
              ) : (
                <p className="text-white text-sm mt-1">
                  {request.ad_week || '—'}
                </p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <p className={labelClass}>Due Date</p>
              {editing ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`${inputClass} mt-1 [color-scheme:dark]`}
                />
              ) : (
                <p className="text-white text-sm mt-1">
                  {request.due_date
                    ? new Date(request.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              )}
            </div>

            {/* Assigned To */}
            <div>
              <p className={labelClass}>Assigned To</p>
              {editing && canEdit ? (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Unassigned</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white text-sm mt-1">
                  {request.assignee?.full_name || 'Unassigned'}
                </p>
              )}
            </div>

            {/* Requester */}
            <div>
              <p className={labelClass}>Requester</p>
              <p className="text-white text-sm mt-1">
                {request.requester?.full_name || 'Unknown'}
              </p>
            </div>

            {/* Dates */}
            <div>
              <p className={labelClass}>Created</p>
              <p className="text-white text-sm mt-1">
                {formatDateTime(request.created_at)}
              </p>
            </div>
            <div>
              <p className={labelClass}>Last Updated</p>
              <p className="text-white text-sm mt-1">
                {formatDateTime(request.updated_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
