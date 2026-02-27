'use client'

import { CODE_STATUS_COLORS, CODE_STATUS_LABELS, type CodeStatus } from '@/lib/codegen'

export function PanelStatusBar({
  status,
  canEdit,
  copied,
  showMarkLoaded,
  savingDraft,
  markingFinal,
  markingLoaded,
  onSaveDraft,
  onMarkFinal,
  onCopy,
  onMarkLoaded,
}: {
  status: CodeStatus
  canEdit: boolean
  copied: boolean
  showMarkLoaded: boolean
  savingDraft: boolean
  markingFinal: boolean
  markingLoaded: boolean
  onSaveDraft: () => void
  onMarkFinal: () => void
  onCopy: () => void
  onMarkLoaded: () => void
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-brand-800 bg-brand-900/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${CODE_STATUS_COLORS[status]}`}>
          {CODE_STATUS_LABELS[status]}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={!canEdit || savingDraft}
            className="rounded-full border border-brand-700 px-3 py-1.5 text-xs text-brand-200 transition-colors hover:border-brand-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingDraft ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={onMarkFinal}
            disabled={!canEdit || markingFinal}
            className="rounded-full bg-emerald-500/25 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {markingFinal ? 'Marking...' : 'Mark as Final'}
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-100 transition-colors hover:bg-blue-500/25"
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          {showMarkLoaded && (
            <button
              type="button"
              onClick={onMarkLoaded}
              disabled={!canEdit || markingLoaded}
              className="rounded-full bg-fuchsia-500/25 px-3 py-1.5 text-xs font-medium text-fuchsia-100 transition-colors hover:bg-fuchsia-500/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingLoaded ? 'Updating...' : 'Mark as Loaded'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
