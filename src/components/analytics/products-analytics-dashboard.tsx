'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  RefreshCw,
} from 'lucide-react'

type AnalyticsTab = 'performance' | 'status' | 'pricing'
type SortOrder = 'asc' | 'desc'
type MarketingMethodFilter = 'ALL' | 'ORGANIC' | 'ADS'
type ProductStatusFilter = 'ALL' | 'ELIGIBLE' | 'NOT_ELIGIBLE_OR_DISAPPROVED'

interface SortState {
  key: string
  order: SortOrder
}

interface PerformanceRow {
  offer_id: string
  title: string | null
  brand: string | null
  category_l1: string | null
  clicks: number
  impressions: number
  ctr: number
}

interface PerformanceResponse {
  rows: PerformanceRow[]
  total: number
  total_pages: number
  page: number
  summary: {
    total_clicks: number
    total_impressions: number
    average_ctr: number
  }
  last_sync: string | null
}

interface StatusRow {
  offer_id: string
  title: string | null
  brand: string | null
  status: string | null
  feed_label: string | null
  item_issues: unknown[]
  issue_count: number
}

interface StatusResponse {
  rows: StatusRow[]
  total: number
  total_pages: number
  page: number
  summary: {
    total_products: number
    eligible_count: number
    disapproved_count: number
  }
  last_sync: string | null
}

interface PricingRow {
  offer_id: string
  title: string | null
  brand: string | null
  current_price: number | null
  suggested_price: number | null
  price_diff: number | null
  currency: string | null
  predicted_clicks_change_fraction: number
  predicted_impressions_change_fraction: number
  predicted_conversions_change_fraction: number
}

interface PricingResponse {
  rows: PricingRow[]
  total: number
  total_pages: number
  page: number
  summary: {
    products_with_suggestions: number
    average_predicted_click_increase_fraction: number
  }
  last_sync: string | null
}

const DAY_OPTIONS = [7, 14, 28, 90] as const
const TABLE_LIMIT = 50

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatFractionPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
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

function formatRelativeTime(isoTimestamp: string | null, nowMs: number) {
  if (!isoTimestamp) return 'No sync yet'

  const ts = new Date(isoTimestamp).getTime()
  if (!Number.isFinite(ts)) return 'Unknown'

  const diff = Math.max(0, nowMs - ts)
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function parseErrorMessage(body: unknown, fallback: string) {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const errorValue = body.error
    if (typeof errorValue === 'string' && errorValue.trim()) {
      return errorValue
    }
  }
  return fallback
}

function statusTone(status: string | null) {
  const normalized = status?.toUpperCase() ?? ''
  if (normalized.includes('NOT_ELIGIBLE') || normalized.includes('DISAPPROVED')) {
    return 'bg-red-500/10 text-red-300 border-red-500/40'
  }
  if (normalized.includes('ELIGIBLE')) {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
  }
  return 'bg-zinc-700/50 text-zinc-300 border-zinc-600'
}

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: string
  sort: SortState
  onSort: (field: string) => void
}) {
  const active = sort.key === field
  const indicator = active ? (sort.order === 'asc' ? '▲' : '▼') : ''

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide ${
        active ? 'text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
      <span className="text-[10px]">{indicator}</span>
    </button>
  )
}

function MetricCard({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClassName}`}>{value}</p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-8 rounded bg-zinc-800/70" />
      ))}
    </div>
  )
}

export function ProductsAnalyticsDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('performance')
  const [nowMs, setNowMs] = useState(Date.now())

  const [days, setDays] = useState<number>(7)
  const [marketingMethod, setMarketingMethod] = useState<MarketingMethodFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('ALL')

  const [performanceSearchInput, setPerformanceSearchInput] = useState('')
  const [statusSearchInput, setStatusSearchInput] = useState('')
  const [pricingSearchInput, setPricingSearchInput] = useState('')
  const [performanceSearch, setPerformanceSearch] = useState('')
  const [statusSearch, setStatusSearch] = useState('')
  const [pricingSearch, setPricingSearch] = useState('')

  const [performanceSort, setPerformanceSort] = useState<SortState>({ key: 'clicks', order: 'desc' })
  const [statusSort, setStatusSort] = useState<SortState>({ key: 'offer_id', order: 'desc' })
  const [pricingSort, setPricingSort] = useState<SortState>({
    key: 'predicted_clicks_change_fraction',
    order: 'desc',
  })

  const [performancePage, setPerformancePage] = useState(1)
  const [statusPage, setStatusPage] = useState(1)
  const [pricingPage, setPricingPage] = useState(1)

  const [performanceData, setPerformanceData] = useState<PerformanceResponse | null>(null)
  const [statusData, setStatusData] = useState<StatusResponse | null>(null)
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null)

  const [performanceLoading, setPerformanceLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)

  const [performanceError, setPerformanceError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [pricingError, setPricingError] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [expandedOffers, setExpandedOffers] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPerformanceSearch(performanceSearchInput.trim())
      setPerformancePage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [performanceSearchInput])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatusSearch(statusSearchInput.trim())
      setStatusPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [statusSearchInput])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPricingSearch(pricingSearchInput.trim())
      setPricingPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [pricingSearchInput])

  useEffect(() => {
    setPerformancePage(1)
  }, [days, marketingMethod])

  useEffect(() => {
    setStatusPage(1)
  }, [statusFilter])

  const lastSync = useMemo(() => {
    return (
      performanceData?.last_sync ??
      statusData?.last_sync ??
      pricingData?.last_sync ??
      null
    )
  }, [performanceData?.last_sync, pricingData?.last_sync, statusData?.last_sync])

  const lastSyncLabel = useMemo(() => formatRelativeTime(lastSync, nowMs), [lastSync, nowMs])

  const fetchPerformance = useCallback(async () => {
    setPerformanceLoading(true)
    setPerformanceError(null)

    try {
      const params = new URLSearchParams({
        type: 'performance',
        days: String(days),
        limit: String(TABLE_LIMIT),
        pageNumber: String(performancePage),
        sort: performanceSort.key,
        order: performanceSort.order,
      })

      if (marketingMethod !== 'ALL') {
        params.set('marketing_method', marketingMethod)
      }
      if (performanceSearch) {
        params.set('offer_id', performanceSearch)
      }

      const response = await fetch(`/api/gmc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load product performance.'))
      }

      const payload = (await response.json()) as PerformanceResponse
      setPerformanceData(payload)
    } catch (error) {
      setPerformanceError(error instanceof Error ? error.message : 'Unable to load product performance.')
    } finally {
      setPerformanceLoading(false)
    }
  }, [days, marketingMethod, performancePage, performanceSearch, performanceSort.key, performanceSort.order])

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)

    try {
      const params = new URLSearchParams({
        type: 'status',
        limit: String(TABLE_LIMIT),
        pageNumber: String(statusPage),
        sort: statusSort.key,
        order: statusSort.order,
      })

      if (statusFilter !== 'ALL') {
        params.set('status_filter', statusFilter)
      }
      if (statusSearch) {
        params.set('offer_id', statusSearch)
      }

      const response = await fetch(`/api/gmc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load product status.'))
      }

      const payload = (await response.json()) as StatusResponse
      setStatusData(payload)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to load product status.')
    } finally {
      setStatusLoading(false)
    }
  }, [statusFilter, statusPage, statusSearch, statusSort.key, statusSort.order])

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true)
    setPricingError(null)

    try {
      const params = new URLSearchParams({
        type: 'pricing',
        limit: String(TABLE_LIMIT),
        pageNumber: String(pricingPage),
        sort: pricingSort.key,
        order: pricingSort.order,
      })

      if (pricingSearch) {
        params.set('offer_id', pricingSearch)
      }

      const response = await fetch(`/api/gmc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load price insights.'))
      }

      const payload = (await response.json()) as PricingResponse
      setPricingData(payload)
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : 'Unable to load price insights.')
    } finally {
      setPricingLoading(false)
    }
  }, [pricingPage, pricingSearch, pricingSort.key, pricingSort.order])

  useEffect(() => {
    if (activeTab === 'performance') {
      void fetchPerformance()
    }
  }, [activeTab, fetchPerformance])

  useEffect(() => {
    if (activeTab === 'status') {
      void fetchStatus()
    }
  }, [activeTab, fetchStatus])

  useEffect(() => {
    if (activeTab === 'pricing') {
      void fetchPricing()
    }
  }, [activeTab, fetchPricing])

  const refreshActiveTab = useCallback(async () => {
    if (activeTab === 'performance') {
      await fetchPerformance()
      return
    }
    if (activeTab === 'status') {
      await fetchStatus()
      return
    }
    await fetchPricing()
  }, [activeTab, fetchPerformance, fetchPricing, fetchStatus])

  const runSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)

    try {
      const response = await fetch('/api/gmc/trigger-sync', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to run sync.'))
      }
      await refreshActiveTab()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to run sync.')
    } finally {
      setSyncing(false)
    }
  }, [refreshActiveTab])

  const toggleSort = useCallback((tab: AnalyticsTab, key: string) => {
    if (tab === 'performance') {
      setPerformancePage(1)
      setPerformanceSort((current) => ({
        key,
        order: current.key === key ? (current.order === 'asc' ? 'desc' : 'asc') : 'desc',
      }))
      return
    }

    if (tab === 'status') {
      setStatusPage(1)
      setStatusSort((current) => ({
        key,
        order: current.key === key ? (current.order === 'asc' ? 'desc' : 'asc') : 'desc',
      }))
      return
    }

    setPricingPage(1)
    setPricingSort((current) => ({
      key,
      order: current.key === key ? (current.order === 'asc' ? 'desc' : 'asc') : 'desc',
    }))
  }, [])

  const toggleIssuesExpanded = useCallback((offerId: string) => {
    setExpandedOffers((current) => {
      const next = new Set(current)
      if (next.has(offerId)) {
        next.delete(offerId)
      } else {
        next.add(offerId)
      }
      return next
    })
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
              <Package className="h-6 w-6 text-emerald-400" />
              Product Analytics
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Merchant Center product performance, status, and price insight recommendations.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <div className="text-xs text-zinc-400">
              Last sync <span className="text-zinc-300">{lastSyncLabel}</span>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
            ) : null}
            {syncError ? <p className="text-xs text-red-300">{syncError}</p> : null}
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
          {([
            ['performance', 'Performance'],
            ['status', 'Product Status'],
            ['pricing', 'Price Insights'],
          ] as const).map(([tabValue, label]) => (
            <button
              key={tabValue}
              type="button"
              onClick={() => setActiveTab(tabValue)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tabValue
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'performance' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === option
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                  }`}
                >
                  Last {option} days
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
              {(['ALL', 'ORGANIC', 'ADS'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMarketingMethod(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    marketingMethod === option
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                  }`}
                >
                  {option === 'ALL' ? 'All Methods' : option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              label="Total Clicks"
              value={formatInteger(performanceData?.summary.total_clicks ?? 0)}
            />
            <MetricCard
              label="Total Impressions"
              value={formatInteger(performanceData?.summary.total_impressions ?? 0)}
            />
            <MetricCard
              label="Avg CTR"
              value={formatPercent(performanceData?.summary.average_ctr ?? 0)}
            />
          </div>

          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Performance</h2>
              <input
                value={performanceSearchInput}
                onChange={(event) => setPerformanceSearchInput(event.target.value)}
                placeholder="Filter by Offer ID..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-72"
              />
            </div>

            {performanceError ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {performanceError}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              {performanceLoading && !performanceData ? (
                <TableSkeleton />
              ) : (
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Offer ID" field="offer_id" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Title" field="title" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Brand" field="brand" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Category" field="category_l1" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Clicks" field="clicks" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Impr." field="impressions" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="CTR" field="ctr" sort={performanceSort} onSort={(field) => toggleSort('performance', field)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(performanceData?.rows ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-zinc-500">
                          No performance data found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      (performanceData?.rows ?? []).map((row, index) => (
                        <tr
                          key={`${row.offer_id}-${index}`}
                          className={`text-sm transition-colors hover:bg-zinc-800/70 ${
                            index % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'
                          }`}
                        >
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-100">{row.offer_id}</td>
                          <td className="max-w-[260px] truncate border-b border-zinc-800 px-2 py-2.5 text-zinc-300" title={row.title ?? ''}>
                            {row.title || '—'}
                          </td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-300">{row.brand || '—'}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-300">{row.category_l1 || '—'}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatInteger(row.clicks)}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatInteger(row.impressions)}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatPercent(row.ctr)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>{performanceData?.total ?? 0} results</span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={(performanceData?.page ?? 1) <= 1}
                  onClick={() => setPerformancePage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span>
                  Page {performanceData?.page ?? 1} of {performanceData?.total_pages ?? 1}
                </span>
                <button
                  type="button"
                  disabled={(performanceData?.page ?? 1) >= (performanceData?.total_pages ?? 1)}
                  onClick={() =>
                    setPerformancePage((current) =>
                      Math.min(performanceData?.total_pages ?? 1, current + 1)
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'status' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
              {([
                ['ALL', 'All Statuses'],
                ['ELIGIBLE', 'Eligible'],
                ['NOT_ELIGIBLE_OR_DISAPPROVED', 'Disapproved / Not Eligible'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === value
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard label="Total Products" value={formatInteger(statusData?.summary.total_products ?? 0)} />
            <MetricCard
              label="Eligible"
              value={formatInteger(statusData?.summary.eligible_count ?? 0)}
              valueClassName="text-emerald-400"
            />
            <MetricCard
              label="Disapproved"
              value={formatInteger(statusData?.summary.disapproved_count ?? 0)}
              valueClassName={
                (statusData?.summary.disapproved_count ?? 0) > 0 ? 'text-red-400' : 'text-zinc-300'
              }
            />
          </div>

          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Product Status</h2>
              <input
                value={statusSearchInput}
                onChange={(event) => setStatusSearchInput(event.target.value)}
                placeholder="Filter by Offer ID..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-72"
              />
            </div>

            {statusError ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {statusError}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              {statusLoading && !statusData ? (
                <TableSkeleton />
              ) : (
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Offer ID" field="offer_id" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Title" field="title" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Brand" field="brand" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Status" field="status" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Feed" field="feed_label" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Issues" field="issue_count" sort={statusSort} onSort={(field) => toggleSort('status', field)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statusData?.rows ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                          No status data found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      (statusData?.rows ?? []).map((row, index) => {
                        const expanded = expandedOffers.has(row.offer_id)
                        return (
                          <Fragment key={`${row.offer_id}-${index}`}>
                            <tr
                              className={`text-sm transition-colors hover:bg-zinc-800/70 ${
                                index % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'
                              }`}
                            >
                              <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-100">{row.offer_id}</td>
                              <td className="max-w-[240px] truncate border-b border-zinc-800 px-2 py-2.5 text-zinc-300" title={row.title ?? ''}>
                                {row.title || '—'}
                              </td>
                              <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-300">{row.brand || '—'}</td>
                              <td className="border-b border-zinc-800 px-2 py-2.5">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(row.status)}`}>
                                  {row.status || 'Unknown'}
                                </span>
                              </td>
                              <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-300">{row.feed_label || '—'}</td>
                              <td className="border-b border-zinc-800 px-2 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => toggleIssuesExpanded(row.offer_id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                                >
                                  {row.issue_count}
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </button>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr>
                                <td colSpan={6} className="border-b border-zinc-800 px-3 py-3">
                                  {row.item_issues.length === 0 ? (
                                    <p className="text-xs text-zinc-500">No issues reported.</p>
                                  ) : (
                                    <pre className="max-h-56 overflow-auto rounded-lg border border-zinc-700 bg-zinc-950/50 p-3 text-xs text-zinc-300">
                                      {JSON.stringify(row.item_issues, null, 2)}
                                    </pre>
                                  )}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>{statusData?.total ?? 0} results</span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={(statusData?.page ?? 1) <= 1}
                  onClick={() => setStatusPage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span>
                  Page {statusData?.page ?? 1} of {statusData?.total_pages ?? 1}
                </span>
                <button
                  type="button"
                  disabled={(statusData?.page ?? 1) >= (statusData?.total_pages ?? 1)}
                  onClick={() =>
                    setStatusPage((current) => Math.min(statusData?.total_pages ?? 1, current + 1))
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'pricing' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetricCard
              label="Products with Suggestions"
              value={formatInteger(pricingData?.summary.products_with_suggestions ?? 0)}
            />
            <MetricCard
              label="Avg Predicted Click Increase"
              value={formatFractionPercent(pricingData?.summary.average_predicted_click_increase_fraction ?? 0)}
            />
          </div>

          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Price Insights</h2>
              <input
                value={pricingSearchInput}
                onChange={(event) => setPricingSearchInput(event.target.value)}
                placeholder="Filter by Offer ID..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-72"
              />
            </div>

            {pricingError ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {pricingError}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              {pricingLoading && !pricingData ? (
                <TableSkeleton />
              ) : (
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Offer ID" field="offer_id" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Title" field="title" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-left">
                        <SortHeader label="Brand" field="brand" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Current" field="current_price" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Suggested" field="suggested_price" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Diff" field="price_diff" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Click %" field="predicted_clicks_change_fraction" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Impr %" field="predicted_impressions_change_fraction" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                      <th className="border-b border-zinc-700 pb-2 text-right">
                        <SortHeader label="Conv %" field="predicted_conversions_change_fraction" sort={pricingSort} onSort={(field) => toggleSort('pricing', field)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pricingData?.rows ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-sm text-zinc-500">
                          No price insights available for this account or filter.
                        </td>
                      </tr>
                    ) : (
                      (pricingData?.rows ?? []).map((row, index) => (
                        <tr
                          key={`${row.offer_id}-${index}`}
                          className={`text-sm transition-colors hover:bg-zinc-800/70 ${
                            index % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'
                          }`}
                        >
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-100">{row.offer_id}</td>
                          <td className="max-w-[220px] truncate border-b border-zinc-800 px-2 py-2.5 text-zinc-300" title={row.title ?? ''}>
                            {row.title || '—'}
                          </td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-zinc-300">{row.brand || '—'}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatMoney(row.current_price, row.currency)}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatMoney(row.suggested_price, row.currency)}</td>
                          <td className={`border-b border-zinc-800 px-2 py-2.5 text-right ${
                            row.price_diff === null
                              ? 'text-zinc-500'
                              : row.price_diff < 0
                                ? 'text-emerald-400'
                                : row.price_diff > 0
                                  ? 'text-amber-300'
                                  : 'text-zinc-300'
                          }`}>
                            {row.price_diff === null ? '—' : formatMoney(row.price_diff, row.currency)}
                          </td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatFractionPercent(row.predicted_clicks_change_fraction)}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatFractionPercent(row.predicted_impressions_change_fraction)}</td>
                          <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">{formatFractionPercent(row.predicted_conversions_change_fraction)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>{pricingData?.total ?? 0} results</span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={(pricingData?.page ?? 1) <= 1}
                  onClick={() => setPricingPage((current) => Math.max(1, current - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span>
                  Page {pricingData?.page ?? 1} of {pricingData?.total_pages ?? 1}
                </span>
                <button
                  type="button"
                  disabled={(pricingData?.page ?? 1) >= (pricingData?.total_pages ?? 1)}
                  onClick={() =>
                    setPricingPage((current) =>
                      Math.min(pricingData?.total_pages ?? 1, current + 1)
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
