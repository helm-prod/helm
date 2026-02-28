/*
RUN THIS IN SUPABASE SQL EDITOR BEFORE DEPLOYING:
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS conversions INTEGER;
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS cart_to_view_rate NUMERIC(8,6);
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS purchase_to_view_rate NUMERIC(8,6);
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS transactions_per_purchaser NUMERIC(8,4);
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS purchase_revenue NUMERIC(12,2);
ALTER TABLE ga4_page_metrics ADD COLUMN IF NOT EXISTS ad_week_number INTEGER;
*/

import { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { fetchGa4Report, type Ga4ReportRow } from '@/lib/ga4/client'
import { getCurrentAdWeek, getPreviousAdWeek } from '@/lib/ga4/ad-weeks'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface Ga4UpsertRow extends Ga4ReportRow {
  period_type: 'current_week' | 'previous_week'
  period_start: string
  period_end: string
  ad_week_number: number
}

const CONFLICT_COLUMNS = ['page_path', 'period_start', 'period_end', 'period_type'] as const
const REQUIRED_COLUMNS: string[] = [...CONFLICT_COLUMNS]
const SUMMABLE_METRIC_COLUMNS: Array<keyof Ga4UpsertRow> = [
  'screenpage_views',
  'active_users',
  'sessions',
  'bounce_rate',
  'avg_session_duration',
  'conversions',
  'add_to_carts',
  'ecommerce_purchases',
  'item_revenue',
  'cart_to_view_rate',
  'purchase_to_view_rate',
  'transactions_per_purchaser',
  'purchase_revenue',
]

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimestamp(dateString: string) {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10))
  if (!year || !month || !day) return Number.NaN
  return Date.UTC(year, month - 1, day)
}

function clampDateToRange(date: string, start: string, end: string) {
  const dateTs = toTimestamp(date)
  const startTs = toTimestamp(start)
  const endTs = toTimestamp(end)

  if (dateTs < startTs) return start
  if (dateTs > endTs) return end
  return date
}

function extractMissingColumn(error: PostgrestError | Error) {
  const text = [
    'message' in error ? error.message : '',
    'details' in error ? error.details ?? '' : '',
    'hint' in error ? error.hint ?? '' : '',
  ]
    .filter(Boolean)
    .join(' | ')

  const postgrestMatch = text.match(/Could not find the '([^']+)' column/i)
  if (postgrestMatch?.[1]) {
    return postgrestMatch[1]
  }

  const postgresMatch = text.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation/i)
  if (postgresMatch?.[1]) {
    return postgresMatch[1]
  }

  return null
}

function projectColumns(rows: Ga4UpsertRow[], allowedColumns: string[]) {
  return rows.map((row) => {
    const projected: Record<string, unknown> = {}

    for (const key of allowedColumns) {
      const value = row[key as keyof Ga4UpsertRow]
      if (value !== undefined) {
        projected[key] = value
      }
    }

    return projected
  })
}

function sumNullableNumbers(currentValue: number | null, incomingValue: number | null) {
  if (currentValue === null && incomingValue === null) return null
  return (currentValue ?? 0) + (incomingValue ?? 0)
}

function dedupeRowsForUpsert(rows: Ga4UpsertRow[]) {
  const deduped = new Map<string, Ga4UpsertRow>()

  for (const row of rows) {
    const key = `${row.page_path}|${row.period_start}|${row.period_end}|${row.period_type}`
    const existing = deduped.get(key)

    if (!existing) {
      deduped.set(key, { ...row })
      continue
    }

    for (const column of SUMMABLE_METRIC_COLUMNS) {
      const mergedValue = sumNullableNumbers(
        existing[column] as number | null,
        row[column] as number | null
      )
      existing[column] = mergedValue as never
    }

    if (row.page_title) {
      existing.page_title = row.page_title
    }

    if (typeof row.ad_week_number === 'number') {
      existing.ad_week_number = row.ad_week_number
    }
  }

  return Array.from(deduped.values())
}

async function upsertWithFallback(rows: Ga4UpsertRow[]) {
  if (rows.length === 0) return 0

  const dedupedRows = dedupeRowsForUpsert(rows)
  const supabase = createServiceRoleClient()
  let allowedColumns = Array.from(
    new Set(
      dedupedRows.flatMap((row) =>
        Object.keys(row).filter((key) => row[key as keyof Ga4UpsertRow] !== undefined)
      )
    )
  )

  while (allowedColumns.length > 0) {
    const payload = projectColumns(dedupedRows, allowedColumns)
    const { error } = await supabase.from('ga4_page_metrics').upsert(payload, {
      onConflict: CONFLICT_COLUMNS.join(','),
    })

    if (!error) {
      return payload.length
    }

    const missingColumn = extractMissingColumn(error)
    if (!missingColumn || !allowedColumns.includes(missingColumn)) {
      throw error
    }

    if (REQUIRED_COLUMNS.includes(missingColumn)) {
      throw error
    }

    console.warn(`Skipping missing ga4_page_metrics column: ${missingColumn}`)
    allowedColumns = allowedColumns.filter((column) => column !== missingColumn)
  }

  return 0
}

async function logFetch(params: {
  status: 'success' | 'error'
  rowsFetched: number
  durationMs: number
  errorMessage?: string | null
}) {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('ga4_fetch_log').insert({
      status: params.status,
      rows_fetched: params.rowsFetched,
      duration_ms: params.durationMs,
      error_message: params.errorMessage ?? null,
    })
  } catch (loggingError) {
    console.error('Failed to write ga4_fetch_log row', loggingError)
  }
}

function toPeriodRows(params: {
  rows: Ga4ReportRow[]
  periodType: 'current_week' | 'previous_week'
  periodStart: string
  periodEnd: string
  adWeekNumber: number
}): Ga4UpsertRow[] {
  return params.rows.map((row) => ({
    ...row,
    period_type: params.periodType,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    ad_week_number: params.adWeekNumber,
  }))
}

function isBearerTokenValid(request: NextRequest) {
  const header = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!header) {
    console.warn('GA4 refresh called without Authorization header. Allowing request for Vercel cron.')
    return true
  }

  const token = header.replace(/^Bearer\s+/i, '').trim()

  if (!cronSecret) {
    console.warn('CRON_SECRET is missing while Authorization header was provided.')
    return true
  }

  return token === cronSecret
}

export async function POST(request: NextRequest) {
  if (!isBearerTokenValid(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const currentWeek = getCurrentAdWeek()
    const previousWeek = getPreviousAdWeek()
    const today = toIsoDate(new Date())

    const currentWeekEnd = clampDateToRange(today, currentWeek.startDate, currentWeek.endDate)

    const [currentWeekRows, previousWeekRows] = await Promise.all([
      fetchGa4Report({
        startDate: currentWeek.startDate,
        endDate: currentWeekEnd,
      }),
      fetchGa4Report({
        startDate: previousWeek.startDate,
        endDate: previousWeek.endDate,
      }),
    ])

    const currentPayload = toPeriodRows({
      rows: currentWeekRows,
      periodType: 'current_week',
      periodStart: currentWeek.startDate,
      periodEnd: currentWeekEnd,
      adWeekNumber: currentWeek.adWeek,
    })

    const previousPayload = toPeriodRows({
      rows: previousWeekRows,
      periodType: 'previous_week',
      periodStart: previousWeek.startDate,
      periodEnd: previousWeek.endDate,
      adWeekNumber: previousWeek.adWeek,
    })

    const [currentInserted, previousInserted] = await Promise.all([
      upsertWithFallback(currentPayload),
      upsertWithFallback(previousPayload),
    ])

    await logFetch({
      status: 'success',
      rowsFetched: currentInserted + previousInserted,
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      status: 'success',
      current_week_rows: currentInserted,
      previous_week_rows: previousInserted,
      ad_week: currentWeek.adWeek,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GA4 refresh error'

    await logFetch({
      status: 'error',
      rowsFetched: 0,
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    })

    console.error('GA4 refresh failed', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
