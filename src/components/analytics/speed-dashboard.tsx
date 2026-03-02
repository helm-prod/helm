'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gauge, RefreshCw } from 'lucide-react'
import type { PagespeedResult } from '@/lib/types/database'

type Strategy = 'mobile' | 'desktop'
type MetricStatus = 'good' | 'warn' | 'poor' | 'na'

type ScanProgress = {
  done: number
  total: number
}

type PagespeedGetResponse = {
  results?: PagespeedResult[]
  error?: string
}

type PagespeedPostResponse = {
  results?: PagespeedResult[]
  errors?: Array<{ url: string; error: string }>
  error?: string
}

const MAX_POLL_MS = 2 * 60 * 1000
const POLL_INTERVAL_MS = 5 * 1000

const DEFAULT_URLS = [
  { url: 'https://www.mynavyexchange.com/', label: 'Homepage' },
  { url: 'https://www.mynavyexchange.com/browse/electronics', label: 'Electronics' },
  { url: 'https://www.mynavyexchange.com/browse/apparel', label: 'Apparel' },
  { url: 'https://www.mynavyexchange.com/browse/shoes', label: 'Shoes' },
  { url: 'https://www.mynavyexchange.com/browse/accessories', label: 'Accessories' },
  { url: 'https://www.mynavyexchange.com/browse/everyday-home', label: 'Everyday Home' },
  { url: 'https://www.mynavyexchange.com/browse/outdoor-home', label: 'Outdoor Home' },
  { url: 'https://www.mynavyexchange.com/browse/fitness', label: 'Fitness' },
] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeUrlForCompare(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const pathname =
      parsed.pathname !== '/' && parsed.pathname.endsWith('/')
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname
    return `${parsed.origin.toLowerCase()}${pathname}`
  } catch {
    return null
  }
}

const DEFAULT_URL_LABELS = new Map<string, string>()
for (const item of DEFAULT_URLS) {
  const normalized = normalizeUrlForCompare(item.url)
  if (normalized) {
    DEFAULT_URL_LABELS.set(normalized, item.label)
  }
}
const DEFAULT_URL_SET = new Set(DEFAULT_URL_LABELS.keys())

function metricTone(status: MetricStatus) {
  if (status === 'good') {
    return {
      value: 'text-emerald-400',
      border: 'border-t-emerald-400',
      dot: 'bg-emerald-400',
    }
  }

  if (status === 'warn') {
    return {
      value: 'text-amber-400',
      border: 'border-t-amber-400',
      dot: 'bg-amber-400',
    }
  }

  if (status === 'poor') {
    return {
      value: 'text-red-400',
      border: 'border-t-red-400',
      dot: 'bg-red-400',
    }
  }

  return {
    value: 'text-brand-500',
    border: 'border-t-brand-700',
    dot: 'bg-brand-500',
  }
}

function getScoreStatus(score: number | null): MetricStatus {
  if (score === null) return 'na'
  if (score >= 90) return 'good'
  if (score >= 50) return 'warn'
  return 'poor'
}

function getLcpStatus(lcpMs: number | null): MetricStatus {
  if (lcpMs === null) return 'na'
  if (lcpMs <= 2500) return 'good'
  if (lcpMs <= 4000) return 'warn'
  return 'poor'
}

function getClsStatus(cls: number | null): MetricStatus {
  if (cls === null) return 'na'
  if (cls <= 0.1) return 'good'
  if (cls <= 0.25) return 'warn'
  return 'poor'
}

function getInpStatus(inpMs: number | null): MetricStatus {
  if (inpMs === null) return 'na'
  if (inpMs <= 200) return 'good'
  if (inpMs <= 500) return 'warn'
  return 'poor'
}

function getFcpStatus(fcpMs: number | null): MetricStatus {
  if (fcpMs === null) return 'na'
  if (fcpMs <= 1800) return 'good'
  if (fcpMs <= 3000) return 'warn'
  return 'poor'
}

function getTtfbStatus(ttfbMs: number | null): MetricStatus {
  if (ttfbMs === null) return 'na'
  if (ttfbMs <= 800) return 'good'
  if (ttfbMs <= 1800) return 'warn'
  return 'poor'
}

function formatRelativeTime(isoTimestamp: string | null, nowMs: number) {
  if (!isoTimestamp) return 'No data yet'

  const timestamp = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown'

  const diffMs = Math.max(0, nowMs - timestamp)
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function formatSeconds(ms: number | null, fallback = '—') {
  if (ms === null || !Number.isFinite(ms)) return fallback
  return `${(ms / 1000).toFixed(1)}s`
}

function formatMilliseconds(ms: number | null, fallback = '—') {
  if (ms === null || !Number.isFinite(ms)) return fallback
  return `${Math.round(ms)}ms`
}

function formatCls(cls: number | null, fallback = '—') {
  if (cls === null || !Number.isFinite(cls)) return fallback
  if (cls === 0) return '0'

  const absoluteCls = Math.abs(cls)
  if (absoluteCls < 0.01) {
    return cls.toFixed(3)
  }

  return cls.toFixed(2)
}

function formatScore(score: number | null, fallback = '—') {
  if (score === null || !Number.isFinite(score)) return fallback
  return `${Math.round(score)}`
}

function latestFetchedAt(rows: PagespeedResult[]) {
  let latestTs: number | null = null

  for (const row of rows) {
    const ts = new Date(row.fetched_at).getTime()
    if (!Number.isFinite(ts)) continue
    if (latestTs === null || ts > latestTs) latestTs = ts
  }

  return latestTs === null ? null : new Date(latestTs).toISOString()
}

function countCompletedScans(rows: PagespeedResult[]) {
  const completed = new Set<string>()

  for (const row of rows) {
    const normalized = normalizeUrlForCompare(row.url)
    if (normalized && DEFAULT_URL_SET.has(normalized)) {
      completed.add(normalized)
    }
  }

  return completed.size
}

function getHomepageResult(rows: PagespeedResult[]) {
  for (const row of rows) {
    try {
      const parsed = new URL(row.url)
      const pathname = parsed.pathname || '/'
      if (parsed.hostname.includes('mynavyexchange.com') && pathname === '/') {
        return row
      }
    } catch {
      continue
    }
  }

  return rows[0] ?? null
}

function getPageLabel(url: string) {
  const normalized = normalizeUrlForCompare(url)
  if (normalized && DEFAULT_URL_LABELS.has(normalized)) {
    return DEFAULT_URL_LABELS.get(normalized) as string
  }

  try {
    const parsed = new URL(url)
    return parsed.pathname || '/'
  } catch {
    return url
  }
}

function getDisplayedInpMs(row: Pick<PagespeedResult, 'inp_ms' | 'crux_inp_p75_ms'>) {
  return row.inp_ms ?? row.crux_inp_p75_ms
}

function isInpUsingCruxFallback(row: Pick<PagespeedResult, 'inp_ms' | 'crux_inp_p75_ms'>) {
  return row.inp_ms === null && row.crux_inp_p75_ms !== null
}

async function parseApiError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error || `Request failed (${response.status})`
}

function OverviewCard({
  label,
  value,
  subtitle,
  status,
}: {
  label: string
  value: string
  subtitle?: string | null
  status: MetricStatus
}) {
  const tone = metricTone(status)

  return (
    <div className={`rounded-xl border border-brand-800 border-t-4 bg-brand-900 p-5 ${tone.border}`}>
      <p className="text-xs uppercase tracking-wide text-brand-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone.value}`}>{value}</p>
      {subtitle ? <p className="mt-2 text-xs text-brand-500">{subtitle}</p> : null}
    </div>
  )
}

export function SpeedDashboard() {
  const [results, setResults] = useState<PagespeedResult[]>([])
  const [strategy, setStrategy] = useState<Strategy>('mobile')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    done: 0,
    total: DEFAULT_URLS.length,
  })
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const applyResults = useCallback((rows: PagespeedResult[]) => {
    setResults(rows)
    setLastUpdated(latestFetchedAt(rows))
    setScanProgress((prev) => ({ ...prev, done: countCompletedScans(rows) }))
  }, [])

  const fetchCachedResults = useCallback(
    async (
      targetStrategy: Strategy,
      options: { showLoading?: boolean; silent?: boolean } = {}
    ): Promise<PagespeedResult[] | null> => {
      const { showLoading = false, silent = false } = options

      if (showLoading) setLoading(true)
      if (!silent) setError(null)

      try {
        const response = await fetch(
          `/api/pagespeed?strategy=${targetStrategy}&limit=20`,
          { cache: 'no-store' }
        )

        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }

        const payload = (await response.json()) as PagespeedGetResponse
        const fetchedRows = payload.results ?? []
        applyResults(fetchedRows)
        return fetchedRows
      } catch (fetchError) {
        if (!silent) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load page speed data.')
        }
        return null
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [applyResults]
  )

  useEffect(() => {
    void fetchCachedResults(strategy, { showLoading: true })
  }, [strategy, fetchCachedResults])

  const handleRefresh = useCallback(async () => {
    if (scanning) return

    const total = DEFAULT_URLS.length
    const targetStrategy = strategy

    setError(null)
    setLoading(true)
    setScanning(true)
    setScanProgress({ done: countCompletedScans(results), total })

    const postPromise = (async () => {
      const response = await fetch('/api/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: DEFAULT_URLS.map((item) => item.url),
          strategy: targetStrategy,
        }),
      })

      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      return (await response.json()) as PagespeedPostResponse
    })()

    const startedAt = Date.now()
    let done = countCompletedScans(results)

    while (Date.now() - startedAt < MAX_POLL_MS && done < total) {
      const polledRows = await fetchCachedResults(targetStrategy, { silent: true })
      if (polledRows) {
        done = countCompletedScans(polledRows)
        setScanProgress({ done, total })
      }

      if (done >= total) break
      await sleep(POLL_INTERVAL_MS)
    }

    try {
      const postPayload = await postPromise
      if (postPayload.results) {
        applyResults(postPayload.results)
        done = countCompletedScans(postPayload.results)
        setScanProgress({ done, total })
      }

      if (postPayload.errors && postPayload.errors.length > 0) {
        setError(
          `${postPayload.errors.length} page${postPayload.errors.length === 1 ? '' : 's'} failed during scan.`
        )
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to run page speed scan.')
    }

    if (done < total) {
      const finalRows = await fetchCachedResults(targetStrategy, { silent: true })
      if (finalRows) {
        setScanProgress({ done: countCompletedScans(finalRows), total })
      }
    }

    setScanning(false)
    setLoading(false)
  }, [applyResults, fetchCachedResults, results, scanning, strategy])

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const aScore = typeof a.performance_score === 'number' ? a.performance_score : Number.POSITIVE_INFINITY
      const bScore = typeof b.performance_score === 'number' ? b.performance_score : Number.POSITIVE_INFINITY
      return aScore - bScore
    })
  }, [results])

  const homepageResult = useMemo(() => getHomepageResult(results), [results])
  const homepageInpMs = homepageResult ? getDisplayedInpMs(homepageResult) : null
  const homepageInpFromCrux = homepageResult ? isInpUsingCruxFallback(homepageResult) : false
  const lastScannedLabel = formatRelativeTime(lastUpdated, nowMs)
  const isEmpty = !loading && results.length === 0
  const progressPercent =
    scanProgress.total > 0
      ? Math.min(100, Math.round((scanProgress.done / scanProgress.total) * 100))
      : 0

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-brand-800 bg-brand-900 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-xl border border-brand-700 bg-brand-950 p-1">
          {(['mobile', 'desktop'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStrategy(item)}
              disabled={scanning}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
                strategy === item
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-300 hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {item === 'mobile' ? 'Mobile' : 'Desktop'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-400 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Refresh Data'}
          </button>
          <p className="text-sm text-brand-400">Last scanned: {lastScannedLabel}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {scanning ? (
        <div className="space-y-4 rounded-2xl border border-[#1a3a4a] bg-brand-900 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-white">
              Scanning pages... ({scanProgress.done} of {scanProgress.total})
            </p>
            <p className="text-xs text-brand-400">Polling every 5 seconds for updates</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-800">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {scanning ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-xl border border-brand-800 bg-brand-900/60"
            />
          ))}
        </section>
      ) : homepageResult ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            label="Largest Contentful Paint"
            value={formatSeconds(homepageResult.lcp_ms, 'N/A')}
            status={getLcpStatus(homepageResult.lcp_ms)}
            subtitle={
              homepageResult.crux_lcp_p75_ms !== null
                ? `Real users: ${formatSeconds(homepageResult.crux_lcp_p75_ms, 'N/A')}`
                : null
            }
          />
          <OverviewCard
            label="Cumulative Layout Shift"
            value={formatCls(homepageResult.cls, 'N/A')}
            status={getClsStatus(homepageResult.cls)}
            subtitle={
              homepageResult.crux_cls_p75 !== null
                ? `Real users: ${formatCls(homepageResult.crux_cls_p75, 'N/A')}`
                : null
            }
          />
          <OverviewCard
            label="Interaction to Next Paint"
            value={formatMilliseconds(homepageInpMs, 'N/A')}
            status={getInpStatus(homepageInpMs)}
            subtitle={
              homepageInpFromCrux
                ? 'Real users (p75)'
                : homepageResult.crux_inp_p75_ms !== null
                ? `Real users: ${formatMilliseconds(homepageResult.crux_inp_p75_ms, 'N/A')}`
                : null
            }
          />
          <OverviewCard
            label="Performance Score"
            value={formatScore(homepageResult.performance_score, 'N/A')}
            status={getScoreStatus(homepageResult.performance_score)}
          />
        </section>
      ) : null}

      {loading && results.length === 0 ? (
        <div className="rounded-2xl border border-brand-800 bg-brand-900 p-6 text-sm text-brand-400">
          Loading cached speed data...
        </div>
      ) : null}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-brand-800 bg-brand-900 px-6 py-14 text-center">
          <Gauge className="h-14 w-14 text-brand-600" />
          <h3 className="mt-4 text-xl font-semibold text-white">No speed data yet</h3>
          <p className="mt-2 max-w-xl text-sm text-brand-400">
            Run your first Core Web Vitals scan to see how key pages perform.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={scanning}
            className="mt-6 rounded-lg bg-gold-400 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Run First Scan
          </button>
        </div>
      ) : (
        <section className="rounded-2xl border border-brand-800 bg-brand-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Category Speed</h2>
            <p className="text-xs text-brand-500">Sorted by worst performance score first</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-left text-xs uppercase tracking-wide text-[#4a9ead]">
                  <th className="px-3 py-2">Page</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">LCP</th>
                  <th className="px-3 py-2">CLS</th>
                  <th className="px-3 py-2">INP</th>
                  <th className="px-3 py-2">FCP</th>
                  <th className="px-3 py-2">TTFB</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-brand-500">
                      {scanning ? 'Waiting for scan data...' : 'No page speed data available for this strategy yet.'}
                    </td>
                  </tr>
                ) : (
                  sortedResults.map((row) => {
                    const scoreStatus = getScoreStatus(row.performance_score)
                    const lcpStatus = getLcpStatus(row.lcp_ms)
                    const clsStatus = getClsStatus(row.cls)
                    const displayedInpMs = getDisplayedInpMs(row)
                    const inpStatus = getInpStatus(displayedInpMs)
                    const fcpStatus = getFcpStatus(row.fcp_ms)
                    const ttfbStatus = getTtfbStatus(row.ttfb_ms)
                    const inpFromCrux = isInpUsingCruxFallback(row)
                    const scoreTone = metricTone(scoreStatus)
                    const lcpTone = metricTone(lcpStatus)
                    const clsTone = metricTone(clsStatus)
                    const inpTone = metricTone(inpStatus)
                    const fcpTone = metricTone(fcpStatus)
                    const ttfbTone = metricTone(ttfbStatus)
                    const inpValue = formatMilliseconds(displayedInpMs)

                    return (
                      <tr key={`${row.id}-${row.url}`} className="border-b border-brand-800/60 hover:bg-[#0d2137]">
                        <td className="px-3 py-2 text-white">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${scoreTone.dot}`} />
                            <span>{getPageLabel(row.url)}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 font-semibold ${scoreTone.value}`}>
                          {formatScore(row.performance_score)}
                        </td>
                        <td className={`px-3 py-2 font-medium ${lcpTone.value}`}>
                          {formatSeconds(row.lcp_ms)}
                        </td>
                        <td className={`px-3 py-2 font-medium ${clsTone.value}`}>
                          {formatCls(row.cls)}
                        </td>
                        <td
                          className={`px-3 py-2 font-medium ${inpTone.value}`}
                          title={inpFromCrux ? 'INP from CrUX real-user field data (p75)' : undefined}
                        >
                          {inpValue}
                          {inpFromCrux && inpValue !== '—' ? '*' : ''}
                        </td>
                        <td className={`px-3 py-2 font-medium ${fcpTone.value}`}>
                          {formatSeconds(row.fcp_ms)}
                        </td>
                        <td className={`px-3 py-2 font-medium ${ttfbTone.value}`}>
                          {formatMilliseconds(row.ttfb_ms)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}
