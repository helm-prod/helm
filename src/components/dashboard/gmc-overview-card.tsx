'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, TrendingUp } from 'lucide-react'

interface GmcSummaryResponse {
  summary: {
    total_products: number
    eligible_count: number
    disapproved_count: number
    total_clicks_7d: number
    total_impressions_7d: number
    products_with_price_insights: number
    high_effectiveness_suggestions: number
  }
  top_price_opportunities: Array<{
    offer_id: string
    title: string | null
    current_price: number | null
    suggested_price: number | null
    currency: string | null
    predicted_clicks_change_fraction: number
  }>
  last_sync: string | null
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }
  const code = currency || 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercentFromFraction(value: number) {
  return `${(value * 100).toFixed(1)}%`
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

function StatCard({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
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

export function GmcOverviewCard() {
  const [summary, setSummary] = useState<GmcSummaryResponse | null>(null)
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
      const response = await fetch('/api/gmc/metrics?type=summary', { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Unable to load product performance data.')
      }

      const payload = (await response.json()) as GmcSummaryResponse
      setSummary(payload)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load product performance data.')
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

  const data = summary?.summary ?? {
    total_products: 0,
    eligible_count: 0,
    disapproved_count: 0,
    total_clicks_7d: 0,
    total_impressions_7d: 0,
    products_with_price_insights: 0,
    high_effectiveness_suggestions: 0,
  }

  const opportunities = summary?.top_price_opportunities ?? []

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Package className="h-5 w-5 text-emerald-400" />
          Product Performance
        </h2>
        <span className="text-xs text-zinc-400">Last sync {lastSyncLabel}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Products" value={formatInteger(data.total_products)} />
        <StatCard
          label="Eligible"
          value={formatInteger(data.eligible_count)}
          valueClassName="text-emerald-400"
        />
        <StatCard
          label="Disapproved"
          value={formatInteger(data.disapproved_count)}
          valueClassName={data.disapproved_count > 0 ? 'text-red-400' : 'text-zinc-300'}
        />
        <StatCard label="Clicks (7d)" value={formatInteger(data.total_clicks_7d)} />
      </div>

      {opportunities.length > 0 ? (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-300">Price Opportunities</p>
          <ul className="mt-3 space-y-2">
            {opportunities.map((item) => (
              <li
                key={item.offer_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700/70 bg-zinc-900/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">{item.title || item.offer_id}</p>
                  <p className="text-xs text-zinc-400">
                    {formatMoney(item.current_price, item.currency)} {'->'}{' '}
                    {formatMoney(item.suggested_price, item.currency)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {formatPercentFromFraction(item.predicted_clicks_change_fraction)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
