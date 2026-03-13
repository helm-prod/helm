'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { PanelDetailDrawer } from '@/components/site-quality/panel-detail-drawer'
import { ReportRecipientsManager } from '@/components/site-quality/report-recipients-manager'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'
import type { SiteQualityPanelResult, SiteQualityPanelRun } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

const CARD = 'rounded-[24px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)]'
const AOR_OPTIONS = ['All', 'Megan', 'Maddie', 'Daryl'] as const

function formatTimestamp(value: string | null) {
  if (!value) return 'No completed run yet'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function scoreColor(score: number) {
  if (score >= 80) return { text: 'text-blue-200', bar: 'bg-blue-300/80' }
  if (score >= 50) return { text: 'text-indigo-200', bar: 'bg-indigo-300/80' }
  return { text: 'text-red-200', bar: 'bg-red-300/80' }
}

function issueTone(type: string) {
  const map: Record<string, string> = {
    price_mismatch: 'bg-indigo-300/15 text-indigo-200',
    item_not_found: 'bg-blue-400/15 text-blue-200',
    dead_link: 'bg-slate-300/15 text-slate-200',
    redirect: 'bg-indigo-200/15 text-indigo-100',
    context_mismatch: 'bg-blue-300/15 text-blue-100',
    none: 'bg-blue-300/10 text-blue-200',
  }
  return map[type] ?? 'bg-blue-300/10 text-blue-200'
}

export function PanelIntelligenceDashboard({
  initialRun,
  initialResults,
  initialRecipients,
  userRole,
}: {
  initialRun: SiteQualityPanelRun | null
  initialResults: SiteQualityPanelResult[]
  initialRecipients: ReportRecipient[]
  userRole: UserRole
}) {
  const [run, setRun] = useState(initialRun)
  const [results, setResults] = useState(initialResults)
  const [selectedAor, setSelectedAor] = useState<(typeof AOR_OPTIONS)[number]>('All')
  const [selectedPanel, setSelectedPanel] = useState<SiteQualityPanelResult | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [runId, setRunId] = useState(initialRun?.id ?? null)

  useEffect(() => {
    if (!runId || !running) return

    const timer = window.setInterval(async () => {
      const query = new URLSearchParams({ runId, pageSize: '100' })
      const response = await fetch(`/api/site-quality/panel-results?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        setRunning(false)
        setMessage(data.error || 'Failed to refresh panel results')
        return
      }
      setRun(data.run)
      setResults(data.results ?? [])
      if (data.run?.status === 'complete' || data.run?.status === 'failed') {
        setRunning(false)
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [runId, running])

  const filteredResults = useMemo(() => {
    if (selectedAor === 'All') return results
    return results.filter((item) => item.aor_owner === selectedAor)
  }, [results, selectedAor])

  const stats = useMemo(() => {
    const avg = filteredResults.length > 0 ? filteredResults.reduce((sum, item) => sum + item.score, 0) / filteredResults.length : 0
    const issues = filteredResults.reduce((sum, item) => sum + item.issues.filter((issue) => issue.type !== 'none').length, 0)
    return {
      panels: filteredResults.length,
      avgScore: Math.round(avg),
      issues,
      passing: filteredResults.filter((item) => item.score >= 80).length,
    }
  }, [filteredResults])

  const byAor = useMemo(() => {
    return AOR_OPTIONS.slice(1).map((owner) => {
      const rows = results.filter((item) => item.aor_owner === owner)
      const avg = rows.length > 0 ? Math.round(rows.reduce((sum, item) => sum + item.score, 0) / rows.length) : 0
      return { owner, avg, issues: rows.reduce((sum, item) => sum + item.issues.filter((issue) => issue.type !== 'none').length, 0) }
    })
  }, [results])

  async function handleRescore() {
    setRunning(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/panel-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await response.json()
    if (!response.ok) {
      setRunning(false)
      setMessage(data.error || 'Failed to start scoring run')
      return
    }
    setRunId(data.runId)
  }

  async function handleSendReport() {
    if (!run?.id) return
    setSending(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'panel', runId: run.id }),
    })
    const data = await response.json()
    setSending(false)
    setMessage(response.ok ? 'Report sent' : data.error || 'Failed to send report')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Panel Intelligence</h1>
          <p className="mt-2 text-sm text-blue-100/65">L1 panel {'->'} outbound page quality scoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-blue-100/65">Last scored: {formatTimestamp(run?.completed_at ?? run?.created_at ?? null)}</div>
          {userRole === 'admin' && (
            <button onClick={handleRescore} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-blue-300 px-4 py-2 text-sm font-medium text-[#001f3a] disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Scoring...' : 'Re-score now'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Panels scored', stats.panels],
          ['Avg score', stats.avgScore],
          ['Issues flagged', stats.issues],
          ['Passing (>=80)', stats.passing],
        ].map(([label, value]) => (
          <div key={label} className={`${CARD} p-5`}>
            <p className="text-xs uppercase tracking-[0.24em] text-blue-100/55">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className={`${CARD} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Scheduled run</h2>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-blue-100/70"><span className="h-2 w-2 rounded-full bg-blue-300" />Monday 8:30 AM EST</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {AOR_OPTIONS.map((option) => (
                <button key={option} onClick={() => setSelectedAor(option)} className={`rounded-full px-3 py-1.5 text-xs ${selectedAor === option ? 'bg-blue-300 text-[#001f3a]' : 'bg-white/5 text-blue-100/70'}`}>
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {filteredResults.map((panel) => {
              const tone = scoreColor(panel.score)
              return (
                <button key={panel.id} onClick={() => { setSelectedPanel(panel); setDrawerOpen(true) }} className="w-full rounded-2xl border border-white/10 bg-[rgba(0,20,40,0.35)] p-4 text-left transition hover:border-blue-300/30">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-medium text-white">{panel.panel_name}</h3>
                        <span className="rounded-full bg-indigo-300/15 px-2.5 py-1 text-xs text-indigo-200">{panel.aor_owner}</span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-blue-100/50">{panel.panel_id} · {panel.ad_week || 'No ad week'} · {panel.category_l1}</p>
                    </div>
                    <div className={`text-2xl font-semibold ${tone.text}`}>{panel.score}</div>
                  </div>
                  <div className="mt-4 h-[3px] rounded-full bg-white/10"><div className={`h-[3px] rounded-full ${tone.bar}`} style={{ width: `${Math.max(4, panel.score)}%` }} /></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {panel.issues.map((issue, index) => (
                      <span key={`${issue.type}-${index}`} className={`rounded-full px-2.5 py-1 text-xs ${issueTone(issue.type)}`}>{issue.type === 'none' ? 'No issues' : issue.type}</span>
                    ))}
                  </div>
                </button>
              )
            })}
            {filteredResults.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center">
                <p className="text-base font-medium text-white">No panel scores yet</p>
                <p className="mt-2 text-sm text-blue-100/60">
                  {running ? 'Scoring in progress — results will appear here shortly.' : 'Use the Re-score now button to run your first scoring pass.'}
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className={`${CARD} p-5`}>
            <h2 className="text-lg font-semibold text-white">Score distribution by AOR</h2>
            <div className="mt-4 space-y-3">
              {byAor.map((row) => (
                <div key={row.owner} className="rounded-2xl bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white">{row.owner}</span>
                    <span className="text-blue-200">Avg {row.avg}</span>
                  </div>
                  <div className="mt-2 text-xs text-blue-100/65">{row.issues} issues flagged</div>
                </div>
              ))}
            </div>
            <button onClick={handleSendReport} disabled={sending || !run?.id} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-300 px-4 py-3 text-sm font-medium text-[#001f3a] disabled:opacity-60">
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Generate & send report'}
            </button>
            <p className="mt-3 min-h-5 text-sm text-blue-100/70">{message ?? ' '}</p>
          </section>

          {userRole === 'admin' && <ReportRecipientsManager initialRecipients={initialRecipients} />}
        </div>
      </div>

      <PanelDetailDrawer panel={selectedPanel} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
