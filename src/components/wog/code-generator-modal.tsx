'use client'

import { useMemo, useState } from 'react'
import { Copy, X } from 'lucide-react'
import { WOG_HTML_PREFIX, WOG_MILITARY_RECOGNITION, WOG_PARTNERS_SUFFIX } from '@/components/wog/static-content'
import type { WogEvent } from '@/types/wog'

type Props = {
  events: { upcoming: WogEvent[]; past: WogEvent[] }
  onClose: () => void
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatEventDate(startDate: string, endDate: string | null) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null

  if (Number.isNaN(start.getTime())) return startDate

  const formatFull = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date)

  const formatMonthDay = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
    }).format(date)

  if (!end || Number.isNaN(end.getTime()) || endDate === startDate) {
    return formatFull(start)
  }

  if (start.getFullYear() === end.getFullYear()) {
    return `${formatMonthDay(start)} – ${formatFull(end)}`
  }

  return `${formatFull(start)} – ${formatFull(end)}`
}

function renderPreviousEvents(events: WogEvent[]) {
  const cards = events
    .map(
      (event) => `    <div class="col-md-3 col-6">
      <img alt="${escapeHtml(event.event_name)}" class="img-fluid" src="${escapeHtml(event.event_image_url)}" style="filter: grayscale(30%); width: 100%; height: auto;" />
      <p class="title">${escapeHtml(event.event_name)}</p>
      <p class="copy">${escapeHtml(formatEventDate(event.start_date, event.end_date))}</p>
      <p class="copy hidden-mobile">${escapeHtml(event.description)}</p>
    </div>`,
    )
    .join('\n')

  return `<div class="row mt-5">
<div class="col-12"><h2 class="wog">Previous Events</h2></div>
      </div>

<div id="previous-events-container">
  <div class="row mt-4">
${cards}
  </div>
</div>
`
}

export default function CodeGeneratorModal({ events, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const html = useMemo(
    () =>
      [
        WOG_HTML_PREFIX.trim(),
        WOG_MILITARY_RECOGNITION.trim(),
        renderPreviousEvents(events.past).trim(),
        WOG_PARTNERS_SUFFIX.trim(),
      ].join('\n\n'),
    [events.past],
  )

  async function handleCopy() {
    await navigator.clipboard.writeText(html)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-6xl rounded-2xl border border-brand-700 bg-[#001f3a] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Generated Code"
      >
        <div className="flex flex-col gap-3 border-b border-brand-800 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Generated Code</h2>
            <p className="mt-1 text-sm text-brand-300">Paste this into the Endeca LargeTextHome cartridge, replacing the existing content.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-brand-700 px-3 py-2 text-sm font-medium text-brand-200 transition-colors hover:bg-brand-800/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <textarea
          readOnly
          value={html}
          className="mt-4 h-[400px] w-full rounded-2xl border border-brand-800 bg-brand-950/90 p-4 font-mono text-xs text-brand-100 outline-none"
        />
      </div>
    </div>
  )
}
