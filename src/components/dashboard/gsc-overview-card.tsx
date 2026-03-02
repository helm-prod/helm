'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, TrendingDown, TrendingUp } from 'lucide-react'

interface SummaryMetric {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface GainingQuery {
  query: string
  clicks: number
  previous_clicks: number
  click_change: number
}

interface SummaryResponse {
  current: SummaryMetric
  previous: SummaryMetric
  changes: {
    clicks: number | null
    impressions: number | null
    ctr: number | null
    position: number | null
  }
  top_gaining_queries: GainingQuery[]
  last_sync: string | null
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatDelta(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A'
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatRelativeTime(isoTimestamp: string | null, nowMs: number) {
  if (!isoTimestamp) return 'No sync yet'

  const ts = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(ts)) return 'Unknown'

  const diff = Math.max(0, nowMs - ts)
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function MetricCard({
  label,
  value,
  delta,
  invertDirection = false,
}: {
  label: string
  value: string
  delta: number | null
  invertDirection?: boolean
}) {
  const isPositive = delta !== null && (invertDirection ? delta < 0 : delta > 0)
  const isNegative = delta !== null && (invertDirection ? delta > 0 : delta < 0)

  const deltaClass =
    delta === null
      ? 'text-zinc-500'
      : isPositive
        ? 'text-emerald-400'
        : isNegative
          ? 'text-red-400'
          : 'text-zinc-400'

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${deltaClass}`}>
        {delta === null ? null : isPositive ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : isNegative ? (
          <TrendingDown className="h-3.5 w-3.5" />
        ) : null}
        {formatDelta(delta)}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <section className="animate-pulse space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5">
      <div className="h-6 w-56 rounded bg-zinc-800/70" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-xl bg-zinc-800/70" />
        ))}
      </div>
      <div className="h-28 rounded-xl bg-zinc-800/70" />
    </section>
  )
}

export function GscOverviewCard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/gsc/metrics?type=summary&days=7', { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Unable to load search performance data.')
      }

      const payload = (await response.json()) as SummaryResponse
      setSummary(payload)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load search performance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const lastSyncLabel = useMemo(
    () => formatRelativeTime(summary?.last_sync ?? null, nowMs),
    [summary?.last_sync, nowMs]
  )

  if (loading && !summary) {
    return <LoadingSkeleton />
  }

  if (error && !summary) {
    return (
      <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void loadSummary()}
          className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20"
        >
          Retry
        </button>
      </section>
    )
  }

  const current = summary?.current ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  const changes = summary?.changes ?? {
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
  }
  const gainingQueries = summary?.top_gaining_queries ?? []

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Search className="h-5 w-5 text-amber-400" />
          Search Performance
        </h2>
        <span className="text-xs text-zinc-400">Last sync {lastSyncLabel}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Clicks" value={formatInteger(current.clicks)} delta={changes.clicks} />
        <MetricCard
          label="Total Impressions"
          value={formatInteger(current.impressions)}
          delta={changes.impressions}
        />
        <MetricCard label="Average CTR" value={formatPercent(current.ctr)} delta={changes.ctr} />
        <MetricCard
          label="Average Position"
          value={current.position.toFixed(2)}
          delta={changes.position}
          invertDirection
        />
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
        <p className="text-xs uppercase tracking-wide text-amber-300">Top Gaining Queries</p>
        {gainingQueries.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No positive query gains in the selected period.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {gainingQueries.map((row) => (
              <li
                key={row.query}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700/70 bg-zinc-900/60 px-3 py-2"
              >
                <span className="truncate text-sm text-zinc-100">{row.query}</span>
                <span className="shrink-0 text-sm text-zinc-300">{formatInteger(row.clicks)} clicks</span>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />+{formatInteger(row.click_change)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
