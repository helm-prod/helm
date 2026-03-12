'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { ReportRecipientsManager } from '@/components/site-quality/report-recipients-manager'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'
import type { SiteQualityLinkResult, SiteQualityLinkRun } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

const CARD = 'rounded-[24px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)]'
const AOR_OPTIONS = ['Megan', 'Maddie', 'Daryl'] as const

function formatTimestamp(value: string | null) {
  if (!value) return 'No completed run yet'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function pillTone(status: number | null, hasError: boolean) {
  if (hasError || status === 404) return 'border-red-300/30 bg-red-300/10 text-red-200'
  if (status === 301) return 'border-indigo-300/30 bg-indigo-300/10 text-indigo-200'
  return 'border-blue-300/30 bg-blue-300/10 text-blue-200'
}

export function LinkHealthDashboard({
  initialRun,
  initialResults,
  initialRecipients,
  userRole,
}: {
  initialRun: SiteQualityLinkRun | null
  initialResults: SiteQualityLinkResult[]
  initialRecipients: ReportRecipient[]
  userRole: UserRole
}) {
  const [run, setRun] = useState(initialRun)
  const [results, setResults] = useState(initialResults)
  const [scope, setScope] = useState<'all' | 'aor' | 'url'>('all')
  const [scopeValue, setScopeValue] = useState('')
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [runId, setRunId] = useState(initialRun?.id ?? null)

  useEffect(() => {
    if (!runId || !running) return

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/site-quality/link-results?runId=${encodeURIComponent(runId)}&status=all&pageSize=100`)
      const data = await response.json()
      if (!response.ok) {
        setRunning(false)
        setMessage(data.error || 'Failed to refresh link results')
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

  const stats = useMemo(() => ({
    pages: run?.total_pages ?? 0,
    links: run?.total_links ?? 0,
    broken: run?.broken_links ?? results.filter((item) => item.http_status === 404 || item.error_message).length,
    redirects: run?.redirect_links ?? results.filter((item) => item.http_status === 301).length,
  }), [run, results])

  const brokenByAor = useMemo(() => {
    return AOR_OPTIONS.map((owner) => ({
      owner,
      count: results.filter((item) => item.aor_owner === owner && (item.http_status === 404 || item.error_message)).length,
    }))
  }, [results])

  async function handleRun() {
    setRunning(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/link-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, scopeValue: scope === 'all' ? undefined : scopeValue || undefined }),
    })
    const data = await response.json()
    if (!response.ok) {
      setRunning(false)
      setMessage(data.error || 'Failed to trigger run')
      return
    }

    setRunId(data.runId)
    setRun((current) => current ? { ...current, id: data.runId, status: 'running' } : null)
  }

  async function handleSendReport() {
    if (!run?.id) return
    setSending(true)
    setMessage(null)
    const response = await fetch('/api/site-quality/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'link', runId: run.id }),
    })
    const data = await response.json()
    setSending(false)
    setMessage(response.ok ? 'Report sent' : data.error || 'Failed to send report')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Link Health</h1>
          <p className="mt-2 text-sm text-blue-100/65">Automated link checking for public site pages and owned category paths.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-blue-100/65">Last run: {formatTimestamp(run?.completed_at ?? run?.created_at ?? null)}</div>
          <button onClick={handleRun} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-blue-300 px-4 py-2 text-sm font-medium text-[#001f3a] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running...' : 'Run now'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Pages scanned', stats.pages],
          ['Links checked', stats.links],
          ['Broken (404)', stats.broken],
          ['Redirects (301)', stats.redirects],
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
              <h2 className="text-lg font-semibold text-white">Scheduled runs</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-blue-100/70">
                {['Sun 11:30 PM EST', 'Wed 11:30 PM EST', 'Fri 11:30 PM EST'].map((slot) => (
                  <span key={slot} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><span className="h-2 w-2 rounded-full bg-blue-300" />{slot}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'All AORs' },
                { key: 'aor', label: 'My AOR' },
                { key: 'url', label: 'By URL' },
              ].map((item) => (
                <button key={item.key} onClick={() => setScope(item.key as 'all' | 'aor' | 'url')} className={`rounded-full px-3 py-1.5 text-xs ${scope === item.key ? 'bg-blue-300 text-[#001f3a]' : 'bg-white/5 text-blue-100/70'}`}>
                  {item.label}
                </button>
              ))}
              {scope !== 'all' && (
                <input value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder={scope === 'aor' ? 'Megan / Maddie / Daryl' : 'https://...'} className="rounded-full border border-white/10 bg-[#00182f] px-4 py-2 text-xs text-white outline-none" />
              )}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-[#00182f] text-blue-100/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">URL</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[rgba(0,20,40,0.35)]">
                {results.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 align-top text-blue-200">
                      <a href={row.link_url} target="_blank" rel="noreferrer" className="break-all text-blue-300">{row.link_url}</a>
                    </td>
                    <td className="px-4 py-3 align-top text-blue-100/70">{row.source_label || row.page_url}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${pillTone(row.http_status, Boolean(row.error_message))}`}>
                        {row.error_message ? 'error' : row.http_status ?? 'n/a'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-blue-100/70">{row.error_message || row.redirect_target || row.aor_owner || 'OK'}</td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-blue-100/60">No link results yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className={`${CARD} p-5`}>
            <h2 className="text-lg font-semibold text-white">Broken by AOR</h2>
            <div className="mt-4 space-y-3">
              {brokenByAor.map((row) => (
                <div key={row.owner} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-white">{row.owner}</span>
                  <span className="text-sm font-medium text-red-200">{row.count}</span>
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
    </div>
  )
}
