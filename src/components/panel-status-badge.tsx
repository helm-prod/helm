'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type PanelStatus,
  PANEL_STATUS_LABELS,
  PANEL_STATUS_COLORS,
} from '@/lib/types/database'

const ALL_PANEL_STATUSES: PanelStatus[] = [
  'pending',
  'design_needed',
  'in_production',
  'proofing',
  'revision',
  'complete',
  'cancelled',
]

interface PanelStatusBadgeProps {
  status: PanelStatus
  panelId: string
  canEdit: boolean
  onUpdate?: () => void
}

export function PanelStatusBadge({
  status,
  panelId,
  canEdit,
  onUpdate,
}: PanelStatusBadgeProps) {
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

  async function changeStatus(newStatus: PanelStatus) {
    if (newStatus === status) {
      setOpen(false)
      return
    }
    setUpdating(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('panels')
      .update({ status: newStatus })
      .eq('id', panelId)

    if (!error) {
      onUpdate?.()
    }
    setUpdating(false)
    setOpen(false)
  }

  if (!canEdit) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${PANEL_STATUS_COLORS[status]}`}
      >
        {PANEL_STATUS_LABELS[status]}
      </span>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(event) => {
          event.stopPropagation()
          setOpen(!open)
        }}
        disabled={updating}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${PANEL_STATUS_COLORS[status]} ${
          updating ? 'opacity-50' : 'hover:opacity-80'
        }`}
      >
        {PANEL_STATUS_LABELS[status]}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded-xl border border-brand-700 bg-brand-800 py-1 shadow-xl">
          {ALL_PANEL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={(event) => {
                event.stopPropagation()
                changeStatus(s)
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                s === status
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-300 hover:bg-brand-700 hover:text-white'
              }`}
            >
              {PANEL_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function StaticPanelStatusBadge({ status }: { status: PanelStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${PANEL_STATUS_COLORS[status]}`}
    >
      {PANEL_STATUS_LABELS[status]}
    </span>
  )
}
