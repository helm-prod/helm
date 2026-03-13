'use client'

import { CalendarDays, GripVertical, Pencil, Trash2 } from 'lucide-react'
import type { DragEventHandler } from 'react'
import type { WogEvent, WogEventStatus } from '@/types/wog'

type Props = {
  event: WogEvent
  onEdit: (event: WogEvent) => void
  onDelete: (id: string) => void
  onMoveToStatus: (id: string, newStatus: WogEventStatus) => void
  draggable?: boolean
  isDragging?: boolean
  isDropTarget?: boolean
  onDragStart?: DragEventHandler<HTMLDivElement>
  onDragEnd?: DragEventHandler<HTMLDivElement>
  onDragOver?: DragEventHandler<HTMLDivElement>
  onDrop?: DragEventHandler<HTMLDivElement>
}

function formatDateLabel(startDate: string, endDate: string | null) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null

  if (Number.isNaN(start.getTime())) return 'Date unavailable'

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  if (!end || Number.isNaN(end.getTime()) || endDate === startDate) {
    return formatter.format(start)
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function resolveThumbnailSrc(imageUrl: string) {
  return imageUrl.startsWith('http')
    ? imageUrl
    : `https://www.mynavyexchange.com${imageUrl}`
}

export default function EventCard({
  event,
  onEdit,
  onDelete,
  onMoveToStatus,
  draggable = false,
  isDragging = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: Props) {
  const thumbnailSrc = resolveThumbnailSrc(event.event_image_url)
  const moveButtons: Array<{ label: string; status: WogEventStatus; className: string }> =
    event.status === 'upcoming'
      ? [{ label: '→ Past', status: 'past', className: 'bg-slate-700 text-slate-200' }]
      : event.status === 'past'
        ? [
            { label: '← Upcoming', status: 'upcoming', className: 'bg-blue-900 text-blue-200' },
            { label: '→ Archive', status: 'archived', className: 'bg-amber-900/50 text-amber-300' },
          ]
        : [{ label: '← Past', status: 'past', className: 'bg-blue-900 text-blue-200' }]

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group rounded-2xl border bg-[rgba(0,65,115,0.45)] p-3 transition-all ${
        isDropTarget
          ? 'border-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
          : 'border-[rgba(0,110,180,0.25)]'
      } ${event.status === 'archived' ? 'opacity-75' : ''} ${isDragging ? 'scale-[0.98] opacity-50' : ''}`}
    >
      <div className="flex gap-3">
        <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-xl border border-brand-700/70 bg-brand-950/80">
          <img src={thumbnailSrc} alt={event.event_name} className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{event.event_name}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-sky-300">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDateLabel(event.start_date, event.end_date)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {draggable ? <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> : null}
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="rounded-lg p-1.5 text-brand-300 transition-colors hover:bg-brand-800/60 hover:text-white"
                aria-label={`Edit ${event.event_name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{event.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {moveButtons.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={() => onMoveToStatus(event.id, button.status)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-90 ${button.className}`}
              >
                {button.label}
              </button>
            ))}
            {event.status === 'archived' ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete "${event.event_name}" permanently?`)) {
                    onDelete(event.id)
                  }
                }}
                className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400 transition-opacity hover:opacity-90"
              >
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
