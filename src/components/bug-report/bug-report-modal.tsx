'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bug, Lightbulb, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BugReport } from '@/lib/types/database'

export type BugReportContext = {
  screenshotDataUrl: string | null
  screenshotBlob: Blob | null
  pageUrl: string
  pageTitle: string
  userAgent: string
  viewport: string
}

type Props = {
  isOpen: boolean
  context: BugReportContext | null
  onClose: () => void
  onSubmitted: (message: string) => void
}

export function BugReportModal({ isOpen, context, onClose, onSubmitted }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [reportType, setReportType] = useState<BugReport['type']>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setReportType('bug')
    setTitle('')
    setDescription('')
    setErrorMessage(null)
  }, [isOpen])

  if (!isOpen || !context) return null

  async function handleSubmit() {
    if (!context) return
    const reportContext = context

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setErrorMessage('Title is required.')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setErrorMessage('You must be signed in to submit a bug report.')
        return
      }

      let screenshotUrl: string | null = null
      let screenshotUploadFailed = false

      if (reportContext.screenshotBlob) {
        const screenshotPath = `${user.id}/${Date.now()}.png`
        const { error: uploadError } = await supabase.storage
          .from('bug-screenshots')
          .upload(screenshotPath, reportContext.screenshotBlob, {
            contentType: 'image/png',
            upsert: false,
          })

        if (uploadError) {
          screenshotUploadFailed = true
        } else {
          const { data: publicData } = supabase.storage
            .from('bug-screenshots')
            .getPublicUrl(screenshotPath)
          screenshotUrl = publicData.publicUrl || null
        }
      }

      const { error: insertError } = await supabase.from('bug_reports').insert({
        reporter_id: user.id,
        type: reportType,
        title: trimmedTitle,
        description: description.trim() || null,
        screenshot_url: screenshotUrl,
        page_url: reportContext.pageUrl,
        page_title: reportContext.pageTitle || null,
        user_agent: reportContext.userAgent || null,
        viewport: reportContext.viewport || null,
      })

      if (insertError) {
        setErrorMessage(insertError.message)
        return
      }

      setTitle('')
      setDescription('')
      onSubmitted(
        screenshotUploadFailed
          ? 'Bug report submitted without screenshot.'
          : 'Bug report submitted successfully.',
      )
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 mx-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report a Bug"
      >
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
            {reportType === 'bug' ? (
              <>
                <Bug className="h-5 w-5 text-red-400" />
                Report a Bug
              </>
            ) : (
              <>
                <Lightbulb className="h-5 w-5 text-purple-400" />
                Feature Request
              </>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 transition-colors hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {context.screenshotDataUrl ? (
            <img
              src={context.screenshotDataUrl}
              alt="Captured page screenshot"
              className="max-h-48 w-full rounded-lg border border-zinc-700 object-contain"
            />
          ) : (
            <p className="text-sm text-zinc-400">Screenshot unavailable</p>
          )}

          <p className="truncate text-sm text-zinc-400">{context.pageUrl}</p>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-100">Type</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReportType('bug')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  reportType === 'bug'
                    ? 'bg-red-500/10 border-red-500/50 text-red-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Bug className="h-4 w-4" />
                Bug
              </button>
              <button
                type="button"
                onClick={() => setReportType('feature_request')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  reportType === 'feature_request'
                    ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
                Feature Request
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-100">
              Title <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Brief description of the issue"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-100">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Steps to reproduce, expected vs actual behavior..."
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
