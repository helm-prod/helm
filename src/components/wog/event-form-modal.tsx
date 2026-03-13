'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { WogEvent, WogEventStatus } from '@/types/wog'

export type WogEventDraft = {
  event_name: string
  location: string
  start_date: string
  end_date: string
  description: string
  special_notes: string
  event_image_url: string
  cta1_title: string
  cta1_link: string
  cta2_title: string
  cta2_link: string
  status: WogEventStatus
}

type Props = {
  event?: WogEvent
  isSaving?: boolean
  onSave: (draft: WogEventDraft) => void
  onClose: () => void
}

function makeDraft(event?: WogEvent): WogEventDraft {
  return {
    event_name: event?.event_name ?? '',
    location: event?.location ?? '',
    start_date: event?.start_date ?? '',
    end_date: event?.end_date ?? '',
    description: event?.description ?? '',
    special_notes: event?.special_notes ?? '',
    event_image_url: event?.event_image_url ?? '',
    cta1_title: event?.cta1_title ?? '',
    cta1_link: event?.cta1_link ?? '',
    cta2_title: event?.cta2_title ?? '',
    cta2_link: event?.cta2_link ?? '',
    status: event?.status ?? 'upcoming',
  }
}

export default function EventFormModal({ event, isSaving = false, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<WogEventDraft>(() => makeDraft(event))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(makeDraft(event))
    setError(null)
  }, [event])

  function updateField<K extends keyof WogEventDraft>(key: K, value: WogEventDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draft.event_name.trim() || !draft.start_date || !draft.description.trim() || !draft.event_image_url.trim()) {
      setError('Event name, start date, description, and event image URL are required.')
      return
    }

    setError(null)
    onSave(draft)
  }

  const fieldClassName =
    'w-full rounded-xl border border-brand-700 bg-brand-950/80 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-brand-500 focus:border-sky-500'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="presentation">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(0,110,180,0.35)] bg-[#001f3a] p-6 shadow-2xl"
        onClick={(modalEvent) => modalEvent.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={event ? 'Edit WOG event' : 'Add WOG event'}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{event ? 'Edit Event' : 'Add Event'}</h2>
            <p className="mt-1 text-sm text-brand-300">Manage the content that powers the Waves of Gratitude event page.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-brand-300 transition-colors hover:bg-brand-800/50 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Event Name</label>
              <input className={fieldClassName} value={draft.event_name} onChange={(event) => updateField('event_name', event.target.value)} required />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Location</label>
              <input className={fieldClassName} value={draft.location} onChange={(event) => updateField('location', event.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Status</label>
              <select className={fieldClassName} value={draft.status} onChange={(event) => updateField('status', event.target.value as WogEventStatus)}>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Start Date</label>
              <input className={fieldClassName} type="date" value={draft.start_date} onChange={(event) => updateField('start_date', event.target.value)} required />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">End Date</label>
              <input className={fieldClassName} type="date" value={draft.end_date} onChange={(event) => updateField('end_date', event.target.value)} />
              <p className="mt-1 text-xs text-brand-400">Only populate if event spans multiple days</p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Description</label>
              <textarea className={`${fieldClassName} min-h-28`} value={draft.description} onChange={(event) => updateField('description', event.target.value)} required />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Special Notes / Event Time</label>
              <input className={fieldClassName} value={draft.special_notes} onChange={(event) => updateField('special_notes', event.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-brand-100">Event Image URL</label>
              <input className={fieldClassName} value={draft.event_image_url} onChange={(event) => updateField('event_image_url', event.target.value)} required />
              <p className="mt-1 text-xs text-brand-400">Paste FTP/CDN URL directly.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">CTA Button #1 Title</label>
              <input className={fieldClassName} value={draft.cta1_title} onChange={(event) => updateField('cta1_title', event.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">CTA Button #1 Link</label>
              <input className={fieldClassName} value={draft.cta1_link} onChange={(event) => updateField('cta1_link', event.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">CTA Button #2 Title</label>
              <input className={fieldClassName} value={draft.cta2_title} onChange={(event) => updateField('cta2_title', event.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-brand-100">CTA Button #2 Link</label>
              <input className={fieldClassName} value={draft.cta2_link} onChange={(event) => updateField('cta2_link', event.target.value)} />
            </div>
          </div>

          {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-brand-700 px-4 py-2 text-sm font-medium text-brand-200 transition-colors hover:bg-brand-800/50 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {event ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
