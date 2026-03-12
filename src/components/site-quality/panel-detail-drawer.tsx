'use client'

import { useEffect } from 'react'
import type { SiteQualityPanelResult } from '@/lib/site-quality/types'

function scoreTone(score: number) {
  if (score >= 80) return { text: '#93c5fd', fill: 'bg-blue-300/80' }
  if (score >= 50) return { text: '#a5b4fc', fill: 'bg-indigo-300/80' }
  return { text: '#fca5a5', fill: 'bg-red-300/80' }
}

export function PanelDetailDrawer({
  panel,
  open,
  onClose,
}: {
  panel: SiteQualityPanelResult | null
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    if (open) {
      window.addEventListener('keydown', onKeyDown)
    }

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!panel) return null

  const tone = scoreTone(panel.score)

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}
    >
      <button className="absolute inset-0 bg-[rgba(0,10,25,0.6)]" onClick={onClose} aria-label="Close drawer" />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[480px] border-l border-[rgba(0,110,180,0.25)] bg-[#001f3a] p-6 transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-blue-200/70">{panel.aor_owner}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{panel.panel_name}</h2>
            </div>
            <div className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] px-4 py-3 text-3xl font-semibold" style={{ color: tone.text }}>
              {panel.score}
            </div>
          </div>

          <div className="mt-4 h-[3px] w-full rounded-full bg-white/10">
            <div className={`h-[3px] rounded-full ${tone.fill}`} style={{ width: `${Math.max(4, panel.score)}%` }} />
          </div>

          <div className="mt-6 space-y-5 overflow-y-auto pr-1">
            <section className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-4">
              <h3 className="text-sm font-medium text-white">Panel</h3>
              {panel.panel_image_url ? (
                <img src={panel.panel_image_url} alt={panel.panel_name} className="mt-3 w-full rounded-xl object-cover" />
              ) : (
                <div className="mt-3 flex h-44 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5 text-sm text-blue-100/60">
                  Panel image URL not populated
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-4">
              <h3 className="text-sm font-medium text-white">Destination</h3>
              <a href={panel.outbound_url} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm text-blue-300">
                {panel.outbound_url}
              </a>
              <p className="mt-2 text-sm text-blue-100/70">{panel.outbound_page_title || 'Untitled page'}</p>
            </section>

            <section className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-4">
              <h3 className="text-sm font-medium text-white">Issues</h3>
              <div className="mt-3 space-y-2">
                {panel.issues.map((issue, index) => (
                  <div key={`${issue.type}-${index}`} className="rounded-xl bg-white/5 px-3 py-2 text-sm text-blue-100/80">
                    <div className="font-medium text-white">{issue.type}</div>
                    <div className="mt-1 text-[13px] leading-6">{issue.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)] p-4">
              <h3 className="text-sm font-medium text-white">AI Reasoning</h3>
              <div className="mt-3 rounded-xl bg-[rgba(0,20,40,0.4)] px-3 py-3 text-[13px] leading-7 text-blue-100/75">
                {panel.ai_reasoning}
              </div>
            </section>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <a href={panel.outbound_url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full bg-blue-300 px-4 py-2 text-sm font-medium text-[#001f3a]">
              View page {'->'}
            </a>
          </div>
        </div>
      </aside>
    </div>
  )
}
