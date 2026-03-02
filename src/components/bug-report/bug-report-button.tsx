'use client'

import { useState } from 'react'
import { Bug, Loader2 } from 'lucide-react'
import { BugReportModal, type BugReportContext } from './bug-report-modal'

type Toast = {
  tone: 'success' | 'error'
  message: string
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export function BugReportButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [context, setContext] = useState<BugReportContext | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(tone: Toast['tone'], message: string) {
    setToast({ tone, message })
    window.setTimeout(() => setToast(null), 2600)
  }

  async function prepareBugReport() {
    setIsCapturing(true)

    let screenshotDataUrl: string | null = null
    let screenshotBlob: Blob | null = null

    try {
      try {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(document.body)
        screenshotDataUrl = canvas.toDataURL('image/png')
        screenshotBlob = await blobFromCanvas(canvas)
      } catch {
        // Continue without screenshot so bug submission is still possible.
      }

      setContext({
        screenshotDataUrl,
        screenshotBlob,
        pageUrl: window.location.href,
        pageTitle: document.title,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      })
      setIsOpen(true)
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <>
      {toast && (
        <div
          className={`fixed bottom-24 right-6 z-[70] rounded-lg border px-3 py-2 text-sm shadow-lg ${
            toast.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
              : 'border-red-500/30 bg-red-500/15 text-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => void prepareBugReport()}
          disabled={isCapturing}
          aria-label="Report a Bug"
          className="group relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-amber-400 shadow-lg transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCapturing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bug className="h-5 w-5" />}
          <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            Report a Bug
          </span>
        </button>
      </div>

      <BugReportModal
        isOpen={isOpen}
        context={context}
        onClose={() => setIsOpen(false)}
        onSubmitted={(message) => showToast('success', message)}
      />
    </>
  )
}
