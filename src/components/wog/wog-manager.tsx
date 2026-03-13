'use client'

import { useMemo, useState } from 'react'
import { Copy, Loader2, Plus } from 'lucide-react'
import { ENDECA_SNIPPET } from '@/components/wog/endeca-snippet'
import EventCard from '@/components/wog/event-card'
import EventFormModal, { type WogEventDraft } from '@/components/wog/event-form-modal'
import type { WogEvent, WogEventStatus } from '@/types/wog'

type Props = {
  initialEvents: WogEvent[]
}

type DraggingState = {
  id: string
  fromLane: WogEventStatus
} | null

type LaneState = {
  upcoming: WogEvent[]
  past: WogEvent[]
  archived: WogEvent[]
}

type Notice = {
  type: 'success' | 'error'
  message: string
} | null

type NoticeType = NonNullable<Notice>['type']

const LANE_META: Record<WogEventStatus, { label: string; hint: string; borderClass: string }> = {
  upcoming: {
    label: 'Upcoming Events',
    hint: 'Add and organize events that should still be promoted.',
    borderClass: 'border-[rgba(59,130,246,0.4)]',
  },
  past: {
    label: 'Past Events',
    hint: 'Move completed events here to keep them live in the Previous Events section.',
    borderClass: 'border-[rgba(100,116,139,0.4)]',
  },
  archived: {
    label: 'Archived',
    hint: 'Keep retired events out of the generated HTML.',
    borderClass: 'border-[rgba(71,85,105,0.25)]',
  },
}

function sortEvents(events: WogEvent[]) {
  return [...events].sort((left, right) => left.sort_order - right.sort_order)
}

function splitEvents(events: WogEvent[]): LaneState {
  return {
    upcoming: sortEvents(events.filter((event) => event.status === 'upcoming')),
    past: sortEvents(events.filter((event) => event.status === 'past')),
    archived: sortEvents(events.filter((event) => event.status === 'archived')),
  }
}

function normalizeLane(status: WogEventStatus, events: WogEvent[]) {
  return events.map((event, index) => ({ ...event, status, sort_order: index }))
}

function laneUpdates(lanes: LaneState) {
  return (Object.entries(lanes) as Array<[WogEventStatus, WogEvent[]]>).flatMap(([status, items]) =>
    items.map((event, index) => ({
      id: event.id,
      status,
      sort_order: index,
    })),
  )
}

function formatDateRange(events: WogEvent[]) {
  if (events.length === 0) return 'No events yet'
  return `${events.length} event${events.length === 1 ? '' : 's'}`
}

export default function WogManager({ initialEvents }: Props) {
  const initial = useMemo(() => splitEvents(initialEvents), [initialEvents])
  const [upcoming, setUpcoming] = useState<WogEvent[]>(initial.upcoming)
  const [past, setPast] = useState<WogEvent[]>(initial.past)
  const [archived, setArchived] = useState<WogEvent[]>(initial.archived)
  const [editingEvent, setEditingEvent] = useState<WogEvent | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [dragging, setDragging] = useState<DraggingState>(null)
  const [dragOverLane, setDragOverLane] = useState<WogEventStatus | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [setupCopied, setSetupCopied] = useState(false)

  function setLanes(next: LaneState) {
    setUpcoming(next.upcoming)
    setPast(next.past)
    setArchived(next.archived)
  }

  function getLane(status: WogEventStatus) {
    if (status === 'upcoming') return upcoming
    if (status === 'past') return past
    return archived
  }

  function getCurrentLanes(): LaneState {
    return { upcoming, past, archived }
  }

  function flashNotice(type: NoticeType, message: string) {
    setNotice({ type, message })
    window.setTimeout(() => {
      setNotice((current) => (current?.message === message ? null : current))
    }, 2600)
  }

  async function fetchEvents() {
    const response = await fetch('/api/wog', { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as { events?: WogEvent[]; error?: string } | null

    if (!response.ok || !payload?.events) {
      throw new Error(payload?.error || 'Failed to fetch WOG events.')
    }

    setLanes(splitEvents(payload.events))
  }

  async function persistReorder(next: LaneState) {
    const response = await fetch('/api/wog/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: laneUpdates(next) }),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error || 'Failed to reorder events.')
    }
  }

  async function saveEvent(draft: WogEventDraft) {
    setIsLoading(true)

    try {
      const isEditing = Boolean(editingEvent)
      const targetLaneLength = getLane(draft.status).length
      const response = await fetch('/api/wog', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditing
            ? {
                id: editingEvent?.id,
                ...draft,
                location: draft.location || null,
                end_date: draft.end_date || null,
                special_notes: draft.special_notes || null,
                cta1_title: draft.cta1_title || null,
                cta1_link: draft.cta1_link || null,
                cta2_title: draft.cta2_title || null,
                cta2_link: draft.cta2_link || null,
                sort_order:
                  editingEvent && editingEvent.status !== draft.status
                    ? targetLaneLength
                    : editingEvent?.sort_order,
              }
            : {
                ...draft,
                location: draft.location || null,
                end_date: draft.end_date || null,
                special_notes: draft.special_notes || null,
                cta1_title: draft.cta1_title || null,
                cta1_link: draft.cta1_link || null,
                cta2_title: draft.cta2_title || null,
                cta2_link: draft.cta2_link || null,
                sort_order: targetLaneLength,
              },
        ),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save event.')
      }

      await fetchEvents()
      setEditingEvent(null)
      setShowAddModal(false)
      flashNotice('success', isEditing ? 'Event updated.' : 'Event created.')
    } catch (error) {
      flashNotice('error', error instanceof Error ? error.message : 'Failed to save event.')
    } finally {
      setIsLoading(false)
    }
  }

  async function deleteEvent(id: string) {
    setIsLoading(true)

    try {
      const response = await fetch('/api/wog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete event.')
      }

      await fetchEvents()
      flashNotice('success', 'Event deleted.')
    } catch (error) {
      flashNotice('error', error instanceof Error ? error.message : 'Failed to delete event.')
    } finally {
      setIsLoading(false)
    }
  }

  async function moveEventToStatus(id: string, newStatus: WogEventStatus) {
    const current = getCurrentLanes()
    const sourceStatus = (Object.entries(current) as Array<[WogEventStatus, WogEvent[]]>).find(([, items]) =>
      items.some((event) => event.id === id),
    )?.[0]

    if (!sourceStatus || sourceStatus === newStatus) return

    const sourceLane = current[sourceStatus]
    const destinationLane = current[newStatus]
    const movingEvent = sourceLane.find((event) => event.id === id)
    if (!movingEvent) return

    const next: LaneState = {
      ...current,
      [sourceStatus]: normalizeLane(
        sourceStatus,
        sourceLane.filter((event) => event.id !== id),
      ),
      [newStatus]: normalizeLane(newStatus, [...destinationLane, { ...movingEvent, status: newStatus }]),
    }

    setLanes(next)
    setIsLoading(true)

    try {
      const patchResponse = await fetch('/api/wog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, sort_order: next[newStatus].length - 1 }),
      })
      const patchPayload = (await patchResponse.json().catch(() => null)) as { error?: string } | null
      if (!patchResponse.ok) {
        throw new Error(patchPayload?.error || 'Failed to move event.')
      }

      await persistReorder(next)
      flashNotice('success', 'Event moved.')
    } catch (error) {
      await fetchEvents().catch(() => undefined)
      flashNotice('error', error instanceof Error ? error.message : 'Failed to move event.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDrop(targetLane: WogEventStatus, targetIndex: number | null) {
    if (!dragging) return

    const current = getCurrentLanes()
    const sourceLaneItems = current[dragging.fromLane]
    const movingEvent = sourceLaneItems.find((event) => event.id === dragging.id)
    if (!movingEvent) return

    const sourceWithoutEvent = sourceLaneItems.filter((event) => event.id !== dragging.id)
    const insertionIndex =
      targetIndex === null
        ? current[targetLane].filter((event) => event.id !== dragging.id).length
        : targetIndex

    const destinationBase =
      dragging.fromLane === targetLane
        ? sourceWithoutEvent
        : current[targetLane].filter((event) => event.id !== dragging.id)

    const destination = [...destinationBase]
    destination.splice(insertionIndex, 0, { ...movingEvent, status: targetLane })

    const next: LaneState =
      dragging.fromLane === targetLane
        ? {
            ...current,
            [targetLane]: normalizeLane(targetLane, destination),
          }
        : {
            ...current,
            [dragging.fromLane]: normalizeLane(dragging.fromLane, sourceWithoutEvent),
            [targetLane]: normalizeLane(targetLane, destination),
          }

    const movedAcrossLanes = dragging.fromLane !== targetLane

    setDragging(null)
    setDragOverLane(null)
    setDragOverIndex(null)
    setLanes(next)
    setIsLoading(true)

    try {
      if (movedAcrossLanes) {
        const patchResponse = await fetch('/api/wog', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dragging.id, status: targetLane, sort_order: insertionIndex }),
        })
        const patchPayload = (await patchResponse.json().catch(() => null)) as { error?: string } | null
        if (!patchResponse.ok) {
          throw new Error(patchPayload?.error || 'Failed to move event.')
        }
      }

      await persistReorder(next)
      flashNotice('success', movedAcrossLanes ? 'Event moved.' : 'Lane reordered.')
    } catch (error) {
      await fetchEvents().catch(() => undefined)
      flashNotice('error', error instanceof Error ? error.message : 'Failed to reorder events.')
    } finally {
      setIsLoading(false)
    }
  }

  const lanes: Array<{ status: WogEventStatus; events: WogEvent[] }> = [
    { status: 'upcoming', events: upcoming },
    { status: 'past', events: past },
    { status: 'archived', events: archived },
  ]

  return (
    <div className="relative min-h-[70vh] rounded-[28px] border border-brand-800 bg-[#001f3a] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] md:p-7">
      {notice ? (
        <div
          className={`fixed right-6 top-6 z-[90] rounded-xl border px-4 py-3 text-sm shadow-lg ${
            notice.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
              : 'border-red-500/40 bg-red-500/15 text-red-100'
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border-b border-brand-800 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Content Management</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">WOG Event Manager</h1>
          <p className="mt-2 max-w-3xl text-sm text-brand-300">
            Manage Upcoming, Past, and Archived Waves of Gratitude events. Published changes are picked up live by the public WOG endpoint.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-800/60"
        >
          <Plus className="h-4 w-4" />
          Add Event
        </button>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {lanes.map(({ status, events }) => {
          const meta = LANE_META[status]
          const isLaneActive = dragOverLane === status

          return (
            <section
              key={status}
              className={`rounded-2xl border bg-brand-900/60 p-4 ${meta.borderClass} ${
                isLaneActive ? 'bg-brand-900/85 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]' : ''
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOverLane(status)
                setDragOverIndex(events.length)
              }}
              onDrop={(event) => {
                event.preventDefault()
                void handleDrop(status, dragOverIndex)
              }}
            >
              <div className="flex items-start justify-between gap-3 border-b border-brand-800 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{meta.label}</h2>
                  <p className="mt-1 text-sm text-brand-400">{meta.hint}</p>
                </div>
                <div className="rounded-full bg-brand-950/80 px-3 py-1 text-xs font-medium text-brand-300">
                  {formatDateRange(events)}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-brand-700/70 bg-brand-950/50 px-4 py-8 text-center text-sm text-brand-400">
                    {status === 'upcoming'
                      ? 'No upcoming events. Add one to get started.'
                      : status === 'past'
                        ? 'Drag completed events here to include them in generated code.'
                        : 'Archived items stay out of the generated HTML.'}
                  </div>
                ) : null}

                {events.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={(selectedEvent) => {
                      setEditingEvent(selectedEvent)
                      setShowAddModal(false)
                    }}
                    onDelete={(id) => void deleteEvent(id)}
                    onMoveToStatus={(id, newStatus) => void moveEventToStatus(id, newStatus)}
                    draggable
                    isDragging={dragging?.id === event.id}
                    isDropTarget={dragOverLane === status && dragOverIndex === index}
                    onDragStart={() => setDragging({ id: event.id, fromLane: status })}
                    onDragEnd={() => {
                      setDragging(null)
                      setDragOverLane(null)
                      setDragOverIndex(null)
                    }}
                    onDragOver={(dragEvent) => {
                      dragEvent.preventDefault()
                      setDragOverLane(status)
                      setDragOverIndex(index)
                    }}
                    onDrop={(dragEvent) => {
                      dragEvent.preventDefault()
                      void handleDrop(status, index)
                    }}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] bg-[#001f3a]/50">
          <div className="inline-flex items-center gap-3 rounded-full border border-brand-700 bg-brand-950/95 px-4 py-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving changes
          </div>
        </div>
      ) : null}

      <details className="mt-6 rounded-2xl border border-brand-800 bg-brand-900/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
          One-time Endeca setup &#8250;
        </summary>
        <div className="border-t border-brand-800 px-4 pb-4 pt-4">
          <h3 className="text-base font-semibold text-white">Endeca Cartridge Setup</h3>
          <p className="mt-2 max-w-3xl text-sm text-brand-300">
            This only needs to be pasted once. After the initial setup, all changes in Helm go live automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-400">LargeTextHome snippet</p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(ENDECA_SNIPPET)
                setSetupCopied(true)
                window.setTimeout(() => setSetupCopied(false), 2000)
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-brand-700 px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-brand-800/50 hover:text-white"
            >
              <Copy className="h-4 w-4" />
              {setupCopied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
          <textarea
            readOnly
            value={ENDECA_SNIPPET}
            className="mt-3 h-[320px] w-full rounded-2xl border border-brand-800 bg-brand-950/90 p-4 font-mono text-xs text-brand-100 outline-none"
          />
        </div>
      </details>

      {(showAddModal || editingEvent) && (
        <EventFormModal
          event={editingEvent ?? undefined}
          isSaving={isLoading}
          onClose={() => {
            setShowAddModal(false)
            setEditingEvent(null)
          }}
          onSave={(draft) => void saveEvent(draft)}
        />
      )}
    </div>
  )
}
