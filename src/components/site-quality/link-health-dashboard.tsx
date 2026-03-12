'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Image as ImageIcon, RefreshCw, Send } from 'lucide-react'
import { L1_PAGES } from '@/config/l1-pages'
import type { ReportRecipient } from '@/lib/site-quality/report-recipients'
import type { SiteQualityLinkResult, SiteQualityLinkRun } from '@/lib/site-quality/types'
import type { UserRole } from '@/lib/types/database'

const CARD = 'rounded-[24px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,65,115,0.45)]'
const OWNER_OPTIONS = ['All', 'Megan', 'Maddie', 'Daryl'] as const

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
  is_broken?: boolean | null
}

type PageGroup = {
  key: string
  label: string
  owner: string
  pageUrl: string
  issueCount: number
  rows: LinkHealthResult[]
  isClean: boolean
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

function normalizeOwner(value: string | null | undefined) {
  if (!value) return ''
  const lowered = value.toLowerCase()
  return lowered.charAt(0).toUpperCase() + lowered.slice(1)
}

function buildAorCounts(rows: LinkHealthResult[]) {
  const counts: Record<string, number> = {}

  for (const result of rows) {
    const owner = result.aor_owner?.toLowerCase()
    const isBroken = result.is_broken ?? (Boolean(result.error_message) || result.http_status === null || result.http_status === 404)

    if (!owner || !isBroken) continue
    counts[owner] = (counts[owner] ?? 0) + 1
  }

  return counts
}

function resolvePageLabel(row: LinkHealthResult) {
  return row.page_label || row.source_label || L1_PAGES.find((page) => page.url === row.page_url)?.label || row.page_url
}

function resolvePageOwner(rows: LinkHealthResult[], label: string, pageUrl: string) {
  return normalizeOwner(rows[0]?.aor_owner) || normalizeOwner(L1_PAGES.find((page) => page.label === label || page.url === pageUrl)?.aorOwner) || 'Unassigned'
}

function buildPageGroups(rows: LinkHealthResult[]) {
  const grouped = new Map<string, PageGroup>()

  for (const page of L1_PAGES) {
    grouped.set(page.label, {
      key: page.label,
      label: page.label,
      owner: normalizeOwner(page.aorOwner),
      pageUrl: page.url,
      issueCount: 0,
      rows: [],
      isClean: true,
    })
  }

  for (const row of rows) {
    const label = resolvePageLabel(row)
    const existing = grouped.get(label)

    if (existing) {
      existing.rows.push(row)
      existing.issueCount += 1
      existing.isClean = false
      if (!existing.pageUrl && row.page_url) existing.pageUrl = row.page_url
      if (!existing.owner && row.aor_owner) existing.owner = normalizeOwner(row.aor_owner)
      continue
    }

    grouped.set(label, {
      key: label,
      label,
      owner: resolvePageOwner([row], label, row.page_url),
      pageUrl: row.page_url,
      issueCount: 1,
      rows: [row],
      isClean: false,
    })
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.issueCount === 0 && b.issueCount > 0) return 1
    if (a.issueCount > 0 && b.issueCount === 0) return -1
    if (a.issueCount !== b.issueCount) return b.issueCount - a.issueCount
    return a.label.localeCompare(b.label)
  })
}

function getStatusMeta(result: LinkHealthResult) {
  if (!result.link_url) {
    return {
      label: 'unlinked',
      className: 'border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.12)] text-amber-300',
      ownerBucket: 'unlinked' as const,
    }
  }

  if (result.http_status === 404) {
    return {
      label: '404',
      className: 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.12)] text-red-300',
      ownerBucket: 'broken' as const,
    }
  }

  if (result.http_status === 403) {
    return {
      label: '403',
      className: 'border-[rgba(148,163,184,0.2)] bg-[rgba(148,163,184,0.12)] text-slate-300',
      ownerBucket: 'blocked' as const,
    }
  }

  if (result.http_status !== null && result.http_status >= 300 && result.http_status < 400) {
    return {
      label: '301',
      className: 'border-[rgba(56,189,248,0.2)] bg-[rgba(56,189,248,0.12)] text-sky-300',
      ownerBucket: 'redirect' as const,
    }
  }

  return {
    label: result.http_status?.toString() ?? 'error',
    className: 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.12)] text-red-300',
    ownerBucket: 'broken' as const,
  }
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
  const [aorCounts, setAorCounts] = useState<Record<string, number>>(() => buildAorCounts(initialResults as LinkHealthResult[]))
  const [progress, setProgress] = useState<ScanProgress>({
    pagesScanned: 0,
    totalPages: 0,
    linksChecked: 0,
    brokenFound: 0,
  })
  const [selectedAorFilter, setSelectedAorFilter] = useState<(typeof OWNER_OPTIONS)[number]>('All')
  const [collapsedPages, setCollapsedPages] = useState<Record<string, boolean>>({})

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

  const pageGroups = useMemo(() => buildPageGroups(results as LinkHealthResult[]), [results])

  useEffect(() => {
    setCollapsedPages((current) => {
      const next = { ...current }
      for (const group of pageGroups) {
        if (!(group.key in next)) {
          next[group.key] = group.issueCount === 0
        }
      }
      return next
    })
  }, [pageGroups])

  const filteredGroups = useMemo(() => {
    if (selectedAorFilter === 'All') return pageGroups
    return pageGroups.filter((group) => group.owner.toLowerCase() === selectedAorFilter.toLowerCase())
  }, [pageGroups, selectedAorFilter])

  const ownerStats = useMemo(() => {
    const statsMap = new Map<string, { owner: string; total: number; unlinked: number; broken: number; blocked: number; redirect: number }>()

    for (const row of results as LinkHealthResult[]) {
      const owner = normalizeOwner(row.aor_owner)
      if (!owner || owner === 'Leigh') continue

      if (!statsMap.has(owner)) {
        statsMap.set(owner, { owner, total: 0, unlinked: 0, broken: 0, blocked: 0, redirect: 0 })
      }

      const current = statsMap.get(owner) as { owner: string; total: number; unlinked: number; broken: number; blocked: number; redirect: number }
      const status = getStatusMeta(row)
      current.total += 1
      current[status.ownerBucket] += 1
    }

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner))
  }, [results])

  const maxOwnerTotal = ownerStats[0]?.total ?? 1

  async function fetchResults(runId: string) {
    const response = await fetch(`/api/site-quality/link-results?runId=${encodeURIComponent(runId)}&status=all&pageSize=100`)
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load link results')
    }

    const nextResults = (data.results ?? []) as LinkHealthResult[]
    setRun(data.run)
    setResults(nextResults)
    setAorCounts(buildAorCounts(nextResults))
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
          ['Issues found', stats.broken],
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className={`${CARD} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold text-white">Issues by page</h2>
            <div className="flex flex-wrap gap-2">
              {OWNER_OPTIONS.map((option) => {
                const isActive = selectedAorFilter === option
                return (
                  <button
                    key={option}
                    onClick={() => setSelectedAorFilter(option)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'border-[rgba(0,110,180,0.5)] bg-[rgba(0,110,180,0.3)] text-[#93c5fd]'
                        : 'border-transparent bg-white/5 text-blue-100/55 hover:border-[rgba(0,110,180,0.25)] hover:text-blue-100/80'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {filteredGroups.map((group) => {
              const isCollapsed = collapsedPages[group.key] ?? group.issueCount === 0
              return (
                <div key={group.key} className={`overflow-hidden rounded-2xl border border-[rgba(0,110,180,0.18)] bg-[rgba(0,20,40,0.28)] ${group.isClean ? 'opacity-55' : ''}`}>
                  <button
                    onClick={() => setCollapsedPages((current) => ({ ...current, [group.key]: !isCollapsed }))}
                    className="flex w-full items-center gap-3 bg-[rgba(0,25,55,0.4)] px-4 py-3 text-left transition hover:bg-[rgba(0,35,75,0.5)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-slate-300">{group.label}</div>
                      <div className="mt-1 text-[10px] text-slate-600">{group.owner}</div>
                    </div>
                    {group.issueCount > 0 ? (
                      <span className="rounded-full border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.15)] px-2.5 py-1 text-[10px] font-medium text-[#fca5a5]">
                        {group.issueCount} issues
                      </span>
                    ) : (
                      <span className="rounded-full border border-[rgba(52,211,153,0.15)] bg-[rgba(52,211,153,0.1)] px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                        ✓ clean
                      </span>
                    )}
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#1e3a5f]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[#1e3a5f]" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-[rgba(0,110,180,0.12)]">
                      {group.rows.map((result) => {
                        const status = getStatusMeta(result)
                        const metaParts = [
                          result.ad_week ? `Wk ${result.ad_week}` : null,
                          result.slot ? `Slot ${result.slot}` : null,
                        ].filter(Boolean)

                        return (
                          <button
                            key={result.id}
                            onClick={() => setSelectedResult(result)}
                            className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-[rgba(0,70,140,0.2)]"
                          >
                            <div className="relative h-[50px] w-[80px] shrink-0 overflow-hidden rounded-[4px] border border-[rgba(0,110,180,0.25)] bg-[rgba(0,35,80,0.8)]">
                              {result.panel_image ? (
                                <img src={toAbsoluteUrl(result.panel_image)} alt={result.slot || group.label} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-600">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              )}
                              {result.slot && (
                                <span className="absolute bottom-1 right-1 rounded bg-[rgba(0,15,35,0.72)] px-1 py-0.5 font-mono text-[9px] text-slate-500">
                                  {result.slot}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-medium text-slate-300">{group.label}</div>
                              {metaParts.length > 0 && <div className="mt-1 text-[11px] text-slate-700">{metaParts.join(' · ')}</div>}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                                {status.label}
                              </span>
                              <span className="text-[11px] text-[#1e3a5f]">›</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <div className="space-y-3">
          <section className={`${CARD} p-5`}>
            <h2 className="text-lg font-semibold text-white">Issues by owner</h2>
            <div className="mt-4 space-y-3">
              {ownerStats.map((owner) => {
                const parts = [
                  owner.unlinked > 0 ? `${owner.unlinked} unlinked` : null,
                  owner.broken > 0 ? `${owner.broken} broken` : null,
                  owner.blocked > 0 ? `${owner.blocked} blocked (403)` : null,
                  owner.redirect > 0 ? `${owner.redirect} redirects` : null,
                ].filter(Boolean)

                return (
                  <div key={owner.owner} className="border-b border-[rgba(0,110,180,0.12)] pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{owner.owner}</span>
                      <span className="text-[12px] text-slate-400">{owner.total} issues</span>
                    </div>
                    {parts.length > 0 && <div className="mt-1 text-[11px] text-slate-700">{parts.join(' · ')}</div>}
                    <div className="mt-3 h-[3px] rounded-full bg-[rgba(0,40,90,0.8)]">
                      <div className="h-[3px] rounded-full bg-[rgba(0,110,180,0.6)]" style={{ width: `${(owner.total / maxOwnerTotal) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <h2 className="text-lg font-semibold text-white">Schedule</h2>
            <div className="mt-4 space-y-3">
              {['Sun 11:30 PM EST', 'Wed 11:30 PM EST', 'Fri 11:30 PM EST'].map((slot) => {
                const [day, ...rest] = slot.split(' ')
                return (
                  <div key={slot} className="flex items-center justify-between rounded-2xl bg-[rgba(0,20,40,0.35)] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-blue-300" />
                      <span className="text-sm text-slate-300">{day}</span>
                    </div>
                    <span className="text-xs text-blue-100/60">{rest.join(' ')}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <button onClick={handleSendReport} disabled={sending || !run?.id || isScanning} className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] border border-[rgba(0,110,180,0.3)] bg-[rgba(0,110,180,0.22)] px-4 py-3 text-sm font-medium text-[#93c5fd] transition hover:bg-[rgba(0,110,180,0.3)] disabled:opacity-60">
            <Send className="h-4 w-4" />
            ✉ Generate & send report
          </button>

          <p className="px-1 text-sm text-blue-100/70">{message ?? ' '}</p>
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
