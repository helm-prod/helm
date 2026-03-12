'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { ReportRecipientsManager } from '@/components/site-quality/report-recipients-manager'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'
import type { SiteQualityLinkResult, SiteQualityLinkRun } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

const CARD = 'rounded-[24px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)]'
const AOR_OPTIONS = ['Megan', 'Maddie', 'Daryl'] as const

type ScanState = 'idle' | 'starting' | 'running' | 'complete'

type ScanProgress = {
  pagesScanned: number
  totalPages: number
  linksChecked: number
  brokenFound: number
}

type ScanPage = {
  label: string
  url: string
  aorOwner: string
}

type LinkHealthResult = SiteQualityLinkResult & {
  page_label?: string | null
  panel_image?: string | null
  slot?: string | null
  ad_week?: number | null
  ad_year?: number | null
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No completed run yet'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function pillTone(status: number | null, hasError: boolean) {
  if (hasError || status === 404) return 'border-red-300/30 bg-red-300/10 text-red-200'
  if (status !== null && status >= 300 && status < 400) return 'border-indigo-300/30 bg-indigo-300/10 text-indigo-200'
  return 'border-blue-300/30 bg-blue-300/10 text-blue-200'
}

function toAbsoluteUrl(value: string | null | undefined) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://www.mynavyexchange.com${value.startsWith('/') ? '' : '/'}${value}`
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
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [currentRunId, setCurrentRunId] = useState(initialRun?.id ?? null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanStartTime, setScanStartTime] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [currentPage, setCurrentPage] = useState('')
  const [selectedResult, setSelectedResult] = useState<LinkHealthResult | null>(null)
  const [progress, setProgress] = useState<ScanProgress>({
    pagesScanned: 0,
    totalPages: 0,
    linksChecked: 0,
    brokenFound: 0,
  })

  useEffect(() => {
    if (scanState !== 'running' || !scanStartTime) return

    setElapsedMs(Date.now() - scanStartTime)
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - scanStartTime)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [scanStartTime, scanState])

  const stats = useMemo(() => ({
    pages: run?.pages_scanned ?? progress.pagesScanned ?? 0,
    links: run?.links_checked ?? progress.linksChecked ?? 0,
    broken: run?.broken_count ?? progress.brokenFound ?? results.filter((item) => item.http_status === 404 || item.error_message).length,
    redirects: run?.redirect_count ?? results.filter((item) => item.http_status !== null && item.http_status >= 300 && item.http_status < 400).length,
  }), [run, progress, results])

  const brokenByAor = useMemo(() => {
    return AOR_OPTIONS.map((owner) => ({
      owner,
      count: results.filter((item) => item.aor_owner === owner && (item.http_status === 404 || item.error_message)).length,
    }))
  }, [results])

  const scopeOptions = useMemo(() => {
    const options: Array<{ key: 'all' | 'aor' | 'url'; label: string }> = [
      { key: 'all', label: 'All AORs' },
    ]

    if (userRole !== 'admin') {
      options.push({ key: 'aor', label: 'My AOR' })
    }

    options.push({ key: 'url', label: 'By URL' })
    return options
  }, [userRole])

  async function fetchResults(runId: string) {
    const response = await fetch(`/api/site-quality/link-results?runId=${encodeURIComponent(runId)}&status=all&pageSize=100`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load link results')
    }

    setRun(data.run)
    setResults((data.results ?? []) as SiteQualityLinkResult[])
    setCurrentRunId(runId)
  }

  async function startScan() {
    setScanState('starting')
    setMessage(null)
    setCurrentPage('')
    setResults([])
    setProgress({ pagesScanned: 0, totalPages: 0, linksChecked: 0, brokenFound: 0 })
    const startedAt = Date.now()
    setScanStartTime(startedAt)
    setElapsedMs(0)

    try {
      const startRes = await fetch('/api/site-quality/link-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          scope: scope ?? 'all',
          scopeValue,
        }),
      })

      if (!startRes.ok) {
        throw new Error(`Failed to start scan: ${startRes.status}`)
      }

      const startData = await startRes.json()
      const { runId, totalPages, pages } = startData as {
        runId: string
        totalPages: number
        pages: ScanPage[]
      }

      if (!pages || pages.length === 0) {
        throw new Error('No pages returned from start')
      }

      setCurrentRunId(runId)
      setRun((current) =>
        current
          ? { ...current, id: runId, status: 'running' }
          : ({
              id: runId,
              scope,
              scope_value: scopeValue || null,
              trigger: 'manual',
              status: 'running',
              pages_scanned: 0,
              links_checked: 0,
              broken_count: 0,
              redirect_count: 0,
              started_at: new Date(startedAt).toISOString(),
              created_at: new Date(startedAt).toISOString(),
              completed_at: null,
              created_by: null,
            } as SiteQualityLinkRun)
      )
      setScanState('running')
      setProgress((current) => ({ ...current, totalPages }))

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]
        setCurrentPage(page.label)

        const pageRes = await fetch('/api/site-quality/link-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'scan-page',
            runId,
            pageIndex: index,
            pageUrl: page.url,
            pageLabel: page.label,
            aorOwner: page.aorOwner,
            totalPages,
          }),
        })

        if (!pageRes.ok) {
          continue
        }

        const pageData = await pageRes.json()
        setProgress((current) => ({
          pagesScanned: index + 1,
          totalPages,
          linksChecked: current.linksChecked + (pageData.linksChecked ?? 0),
          brokenFound: current.brokenFound + (pageData.brokenFound ?? 0),
        }))

        if (pageData.isComplete) break
      }

      await fetchResults(runId)
      setScanState('complete')
      setCurrentPage('')
    } catch (error) {
      setScanState('idle')
      setCurrentPage('')
      setMessage(error instanceof Error ? error.message : 'Scan failed')
    }
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

  const isScanning = scanState === 'starting' || scanState === 'running'
  const progressPercent = progress.totalPages > 0 ? (progress.pagesScanned / progress.totalPages) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Link Health</h1>
          <p className="mt-2 text-sm text-blue-100/65">Automated link checking for public site pages and owned category paths.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-blue-100/65">Last run: {formatTimestamp(run?.completed_at ?? run?.started_at ?? run?.created_at ?? null)}</div>
          <button onClick={startScan} disabled={isScanning} className="inline-flex items-center gap-2 rounded-full bg-blue-300 px-4 py-2 text-sm font-medium text-[#001f3a] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Running...' : 'Run now'}
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

      {scanState === 'running' && (
        <section className={`${CARD} p-5`}>
          <h2 className="text-lg font-semibold text-white">Scanning mynavyexchange.com</h2>
          <p className="mt-3 text-sm text-blue-100/70">Currently scanning: {currentPage || 'Preparing...'}</p>
          <div className="mt-4 h-[6px] rounded-[3px] bg-[rgba(0,40,80,0.4)]">
            <div className="h-[6px] rounded-[3px] bg-[rgba(147,197,253,0.5)] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-blue-100/70">
            <span>{progress.pagesScanned} of {progress.totalPages} pages</span>
            <span>{progress.linksChecked} links checked · {progress.brokenFound} broken found · {formatElapsed(elapsedMs)} elapsed</span>
          </div>
        </section>
      )}

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
              {scopeOptions.map((item) => (
                <button key={item.key} onClick={() => setScope(item.key as 'all' | 'aor' | 'url')} className={`rounded-full px-3 py-1.5 text-xs ${scope === item.key ? 'bg-blue-300 text-[#001f3a]' : 'bg-white/5 text-blue-100/70'}`}>
                  {item.label}
                </button>
              ))}
              {scope !== 'all' && (
                <input value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder={scope === 'aor' ? 'Enter your AOR' : 'https://...'} className="rounded-full border border-white/10 bg-[#00182f] px-4 py-2 text-xs text-white outline-none" />
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
                {(results as LinkHealthResult[]).map((row) => (
                  <tr key={row.id} onClick={() => setSelectedResult(row)} className="cursor-pointer transition-colors hover:bg-white/5">
                    <td className="px-4 py-3 align-top text-blue-200">
                      {row.link_url ? (
                        <a href={row.link_url} target="_blank" rel="noreferrer" className="break-all text-blue-300" onClick={(event) => event.stopPropagation()}>{row.link_url}</a>
                      ) : (
                        <span className="italic text-blue-100/45">No link assigned</span>
                      )}
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
            <button onClick={handleSendReport} disabled={sending || !run?.id || isScanning} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-300 px-4 py-3 text-sm font-medium text-[#001f3a] disabled:opacity-60">
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Generate & send report'}
            </button>
            <p className="mt-3 min-h-5 text-sm text-blue-100/70">{message ?? ' '}</p>
          </section>

          {userRole === 'admin' && <ReportRecipientsManager initialRecipients={initialRecipients} />}
        </div>
      </div>

      {selectedResult && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedResult(null)}>
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative flex h-full w-[480px] flex-col overflow-y-auto border-l border-[rgba(0,110,180,0.35)] bg-[#001f3a] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(0,110,180,0.25)] px-6 py-4">
              <div>
                <div className="text-sm font-medium text-white">
                  {selectedResult.slot ? `Slot ${selectedResult.slot}` : 'Panel Detail'}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {selectedResult.page_label || selectedResult.source_label || 'Unknown page'} · {selectedResult.aor_owner || 'Unassigned'}
                </div>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="text-xl leading-none text-slate-400 transition-colors hover:text-white"
              >
                ×
              </button>
            </div>

            {selectedResult.panel_image && (
              <div className="border-b border-[rgba(0,110,180,0.25)] px-6 py-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Panel</div>
                <img
                  src={toAbsoluteUrl(selectedResult.panel_image)}
                  alt={`Slot ${selectedResult.slot || ''}`}
                  className="w-full rounded border border-[rgba(0,110,180,0.25)]"
                  onError={(event) => { (event.target as HTMLImageElement).style.display = 'none' }}
                />
                <div className="mt-1.5 truncate text-xs text-slate-500">
                  {selectedResult.panel_image.split('/').pop()}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 px-6 py-4">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Status</div>
                <div className="flex items-center gap-2">
                  {selectedResult.http_status === null ? (
                    <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-300">Unlinked panel</span>
                  ) : selectedResult.http_status === 404 ? (
                    <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-300">404 Not Found</span>
                  ) : (
                    <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-300">
                      {selectedResult.http_status} Error
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Panel Links To</div>
                {selectedResult.link_url ? (
                  <a
                    href={selectedResult.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-blue-300 hover:underline"
                  >
                    {selectedResult.link_url}
                  </a>
                ) : (
                  <span className="text-sm italic text-slate-500">No link assigned</span>
                )}
              </div>

              {selectedResult.error_message && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Detail</div>
                  <div className="text-sm text-slate-300">{selectedResult.error_message}</div>
                </div>
              )}

              {(selectedResult.ad_week || selectedResult.ad_year) && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Ad Week</div>
                  <div className="text-sm text-slate-300">
                    {selectedResult.ad_year ? `20${selectedResult.ad_year}` : ''} Week {selectedResult.ad_week ?? '—'}
                  </div>
                </div>
              )}

              <div className="border-t border-[rgba(0,110,180,0.2)] pt-2">
                <a
                  href={toAbsoluteUrl(selectedResult.page_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 transition-colors hover:text-blue-300"
                >
                  View live page →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
