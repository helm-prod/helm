'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

type DeviceOption = 'ALL' | 'DESKTOP' | 'MOBILE' | 'TABLET'
type SortKey = 'clicks' | 'impressions' | 'ctr' | 'position'
type SortOrder = 'asc' | 'desc'

interface SummaryMetric {
  clicks: number
  impressions: number
  ctr: number
  position: number
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
  last_sync: string | null
}

interface QueryRow {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface PageRow {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface ListResponse<T> {
  rows: T[]
  total: number
  total_pages: number
  page: number
  last_sync: string | null
}

interface SortState {
  key: SortKey
  order: SortOrder
}

const DAY_OPTIONS = [7, 14, 28, 90] as const
const TABLE_LIMIT = 50

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('en-US')
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatPosition(value: number) {
  return value.toFixed(2)
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

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: SortKey
  sort: SortState
  onSort: (field: SortKey) => void
}) {
  const active = sort.key === field
  const indicator = active ? (sort.order === 'asc' ? '▲' : '▼') : ''

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide ${
        active ? 'text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
      <span className="text-[10px]">{indicator}</span>
    </button>
  )
}

function SummaryCard({
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
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${deltaClass}`}>
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

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-8 rounded bg-zinc-800/70" />
      ))}
    </div>
  )
}

export function SearchPerformanceDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [days, setDays] = useState<number>(7)
  const [device, setDevice] = useState<DeviceOption>('ALL')
  const [nowMs, setNowMs] = useState(Date.now())

  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [queries, setQueries] = useState<ListResponse<QueryRow> | null>(null)
  const [queriesLoading, setQueriesLoading] = useState(true)
  const [queriesError, setQueriesError] = useState<string | null>(null)
  const [querySearchInput, setQuerySearchInput] = useState('')
  const [querySearch, setQuerySearch] = useState('')
  const [queryPage, setQueryPage] = useState(1)
  const [querySort, setQuerySort] = useState<SortState>({ key: 'clicks', order: 'desc' })

  const [pages, setPages] = useState<ListResponse<PageRow> | null>(null)
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [pageSearchInput, setPageSearchInput] = useState('')
  const [pageSearch, setPageSearch] = useState('')
  const [pagePage, setPagePage] = useState(1)
  const [pageSort, setPageSort] = useState<SortState>({ key: 'clicks', order: 'desc' })

  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuerySearch(querySearchInput.trim())
      setQueryPage(1)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [querySearchInput])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPageSearch(pageSearchInput.trim())
      setPagePage(1)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [pageSearchInput])

  useEffect(() => {
    setQueryPage(1)
    setPagePage(1)
  }, [days, device])

  const deviceParam = useMemo(() => (device === 'ALL' ? null : device), [device])
  const lastSyncLabel = useMemo(
    () => formatRelativeTime(summary?.last_sync ?? null, nowMs),
    [summary?.last_sync, nowMs]
  )

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)

    try {
      const params = new URLSearchParams({
        type: 'summary',
        days: String(days),
      })

      if (deviceParam) {
        params.set('device', deviceParam)
      }

      const response = await fetch(`/api/gsc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load summary metrics.'))
      }

      const payload = (await response.json()) as SummaryResponse
      setSummary(payload)
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Unable to load summary metrics.')
    } finally {
      setSummaryLoading(false)
    }
  }, [days, deviceParam])

  const fetchQueries = useCallback(async () => {
    setQueriesLoading(true)
    setQueriesError(null)

    try {
      const params = new URLSearchParams({
        type: 'queries',
        days: String(days),
        limit: String(TABLE_LIMIT),
        sort: querySort.key,
        order: querySort.order,
        pageNumber: String(queryPage),
      })

      if (deviceParam) {
        params.set('device', deviceParam)
      }

      if (querySearch) {
        params.set('query', querySearch)
      }

      const response = await fetch(`/api/gsc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load query performance data.'))
      }

      const payload = (await response.json()) as ListResponse<QueryRow>
      setQueries(payload)
    } catch (error) {
      setQueriesError(error instanceof Error ? error.message : 'Unable to load query performance data.')
    } finally {
      setQueriesLoading(false)
    }
  }, [days, deviceParam, queryPage, querySearch, querySort.key, querySort.order])

  const fetchPages = useCallback(async () => {
    setPagesLoading(true)
    setPagesError(null)

    try {
      const params = new URLSearchParams({
        type: 'pages',
        days: String(days),
        limit: String(TABLE_LIMIT),
        sort: pageSort.key,
        order: pageSort.order,
        pageNumber: String(pagePage),
      })

      if (deviceParam) {
        params.set('device', deviceParam)
      }

      if (pageSearch) {
        params.set('page', pageSearch)
      }

      const response = await fetch(`/api/gsc/metrics?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to load page performance data.'))
      }

      const payload = (await response.json()) as ListResponse<PageRow>
      setPages(payload)
    } catch (error) {
      setPagesError(error instanceof Error ? error.message : 'Unable to load page performance data.')
    } finally {
      setPagesLoading(false)
    }
  }, [days, deviceParam, pagePage, pageSearch, pageSort.key, pageSort.order])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchSummary(), fetchQueries(), fetchPages()])
  }, [fetchPages, fetchQueries, fetchSummary])

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    void fetchQueries()
  }, [fetchQueries])

  useEffect(() => {
    void fetchPages()
  }, [fetchPages])

  const toggleQuerySort = useCallback((field: SortKey) => {
    setQueryPage(1)
    setQuerySort((current) => {
      if (current.key === field) {
        return { ...current, order: current.order === 'asc' ? 'desc' : 'asc' }
      }
      return { key: field, order: 'desc' }
    })
  }, [])

  const togglePageSort = useCallback((field: SortKey) => {
    setPagePage(1)
    setPageSort((current) => {
      if (current.key === field) {
        return { ...current, order: current.order === 'asc' ? 'desc' : 'asc' }
      }
      return { key: field, order: 'desc' }
    })
  }, [])

  const triggerSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)

    try {
      const response = await fetch('/api/gsc/trigger-sync', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown
        throw new Error(parseErrorMessage(body, 'Unable to run manual sync.'))
      }

      await refreshAll()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to run manual sync.')
    } finally {
      setSyncing(false)
    }
  }, [refreshAll])

  const current = summary?.current ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  const changes = summary?.changes ?? {
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
              <Search className="h-6 w-6 text-amber-400" />
              Search Performance
            </h1>
            <p className="mt-1 text-sm text-zinc-400">Google Search Console clicks, impressions, CTR, and rankings.</p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <div className="text-xs text-zinc-400">
              Last sync <span className="text-zinc-300">{lastSyncLabel}</span>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void triggerSync()}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
            ) : null}
            {syncError ? <p className="text-xs text-red-300">{syncError}</p> : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === option
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                }`}
              >
                Last {option} days
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/60 p-1">
            {(['ALL', 'DESKTOP', 'MOBILE', 'TABLET'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDevice(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  device === option
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                }`}
              >
                {option === 'ALL' ? 'All Devices' : option.charAt(0) + option.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {summaryError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {summaryError}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryLoading && !summary ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-zinc-700 bg-zinc-800/60" />
          ))
        ) : (
          <>
            <SummaryCard label="Total Clicks" value={formatInteger(current.clicks)} delta={changes.clicks} />
            <SummaryCard
              label="Total Impressions"
              value={formatInteger(current.impressions)}
              delta={changes.impressions}
            />
            <SummaryCard label="Avg CTR" value={formatPercent(current.ctr)} delta={changes.ctr} />
            <SummaryCard
              label="Avg Position"
              value={formatPosition(current.position)}
              delta={changes.position}
              invertDirection
            />
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-4 xl:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Top Queries</h2>
            <input
              value={querySearchInput}
              onChange={(event) => setQuerySearchInput(event.target.value)}
              placeholder="Search queries..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:w-72"
            />
          </div>

          {queriesError ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {queriesError}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            {queriesLoading && !queries ? (
              <TableSkeleton />
            ) : (
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="border-b border-zinc-700 pb-2 text-left">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Query</span>
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="Clicks" field="clicks" sort={querySort} onSort={toggleQuerySort} />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader
                        label="Impressions"
                        field="impressions"
                        sort={querySort}
                        onSort={toggleQuerySort}
                      />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="CTR" field="ctr" sort={querySort} onSort={toggleQuerySort} />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="Position" field="position" sort={querySort} onSort={toggleQuerySort} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(queries?.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-zinc-500">
                        No query data found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    (queries?.rows ?? []).map((row, index) => (
                      <tr
                        key={`${row.query}-${index}`}
                        className={`text-sm transition-colors hover:bg-zinc-800/70 ${
                          index % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'
                        }`}
                      >
                        <td className="max-w-[360px] truncate border-b border-zinc-800 px-2 py-2.5 text-zinc-100">
                          {row.query}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatInteger(row.clicks)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatInteger(row.impressions)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatPercent(row.ctr)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatPosition(row.position)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <span>{queries?.total ?? 0} results</span>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={(queries?.page ?? 1) <= 1}
                onClick={() => setQueryPage((currentValue) => Math.max(1, currentValue - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span>
                Page {queries?.page ?? 1} of {queries?.total_pages ?? 1}
              </span>
              <button
                type="button"
                disabled={(queries?.page ?? 1) >= (queries?.total_pages ?? 1)}
                onClick={() =>
                  setQueryPage((currentValue) =>
                    Math.min(queries?.total_pages ?? 1, currentValue + 1)
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

        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Top Pages</h2>
            <input
              value={pageSearchInput}
              onChange={(event) => setPageSearchInput(event.target.value)}
              placeholder="Filter pages..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:w-64"
            />
          </div>

          {pagesError ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {pagesError}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            {pagesLoading && !pages ? (
              <TableSkeleton />
            ) : (
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="border-b border-zinc-700 pb-2 text-left">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Page</span>
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="Clicks" field="clicks" sort={pageSort} onSort={togglePageSort} />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="Impr." field="impressions" sort={pageSort} onSort={togglePageSort} />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="CTR" field="ctr" sort={pageSort} onSort={togglePageSort} />
                    </th>
                    <th className="border-b border-zinc-700 pb-2 text-right">
                      <SortHeader label="Pos." field="position" sort={pageSort} onSort={togglePageSort} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(pages?.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-zinc-500">
                        No page data found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    (pages?.rows ?? []).map((row, index) => (
                      <tr
                        key={`${row.page}-${index}`}
                        className={`text-sm transition-colors hover:bg-zinc-800/70 ${
                          index % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'
                        }`}
                      >
                        <td
                          title={row.page}
                          className="max-w-[280px] truncate border-b border-zinc-800 px-2 py-2.5 text-zinc-100"
                        >
                          {row.page}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatInteger(row.clicks)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatInteger(row.impressions)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatPercent(row.ctr)}
                        </td>
                        <td className="border-b border-zinc-800 px-2 py-2.5 text-right text-zinc-300">
                          {formatPosition(row.position)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
            <span>{pages?.total ?? 0} results</span>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={(pages?.page ?? 1) <= 1}
                onClick={() => setPagePage((currentValue) => Math.max(1, currentValue - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span>
                Page {pages?.page ?? 1} of {pages?.total_pages ?? 1}
              </span>
              <button
                type="button"
                disabled={(pages?.page ?? 1) >= (pages?.total_pages ?? 1)}
                onClick={() =>
                  setPagePage((currentValue) => Math.min(pages?.total_pages ?? 1, currentValue + 1))
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
    </div>
  )
}
