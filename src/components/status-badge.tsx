'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type RequestStatus,
  type StatusHistoryEntry,
  STATUS_LABELS,
} from '@/lib/types/database'

const STATUS_COLORS: Record<RequestStatus, string> = {
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  triaged: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  in_review: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  complete: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const ALL_STATUSES: RequestStatus[] = [
  'submitted',
  'triaged',
  'in_progress',
  'in_review',
  'complete',
  'cancelled',
]

interface StatusBadgeProps {
  status: RequestStatus
  requestId: string
  canEdit: boolean
  currentUserId: string
  statusHistory: StatusHistoryEntry[]
  onUpdate?: () => void
}

export function StatusBadge({
  status,
  requestId,
  canEdit,
  currentUserId,
  statusHistory,
  onUpdate,
}: StatusBadgeProps) {
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function changeStatus(newStatus: RequestStatus) {
    if (newStatus === status) {
      setOpen(false)
      return
    }
    setUpdating(true)
    const supabase = createClient()

    const newEntry: StatusHistoryEntry = {
      from: status,
      to: newStatus,
      changed_by: currentUserId,
      changed_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('work_requests')
      .update({
        status: newStatus,
        status_history: [...statusHistory, newEntry],
      })
      .eq('id', requestId)

    if (!error) {
      onUpdate?.()
    }
    setUpdating(false)
    setOpen(false)
  }

  if (!canEdit) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}
      >
        {STATUS_LABELS[status]}
      </span>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={updating}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-opacity ${STATUS_COLORS[status]} ${
          updating ? 'opacity-50' : 'hover:opacity-80'
        }`}
      >
        {STATUS_LABELS[status]}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-40 bg-brand-800 border border-brand-700 rounded-lg shadow-xl py-1">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                s === status
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-300 hover:bg-brand-700 hover:text-white'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Simpler static badge used in places where no interaction is needed
export function StaticStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
