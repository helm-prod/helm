import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAdWeek, getPreviousAdWeek } from '@/lib/ga4/ad-weeks'
import { fetchAllSiteReports } from '@/lib/ga4/reports'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

type ReportPeriodType = 'current' | 'previous' | 'last_year'

type SiteReportCacheRow = {
  report_type: string
  period_type: ReportPeriodType
  data: unknown
  ad_week_number: number | null
  period_start: string
  period_end: string
  fetched_at?: string
}

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

function isReportType(value: string): boolean {
  return [
    'overview',
    'devices',
    'channels',
    'search_terms',
    'top_pages',
    'categories',
    'brands',
    'items',
    'coupons',
    'items_viewed',
  ].includes(value)
}

export async function POST(_request: NextRequest) {
  try {
    const currentWeek = getCurrentAdWeek()
    const previousWeek = getPreviousAdWeek()
    const today = toIsoDate(new Date())
    const clampedToday = clampDateToRange(today, currentWeek.startDate, currentWeek.endDate)

    const currentStartDate = new Date(`${currentWeek.startDate}T00:00:00Z`)
    const currentEndDate = new Date(`${clampedToday}T00:00:00Z`)
    const lastYearStart = new Date(currentStartDate)
    const lastYearEnd = new Date(currentEndDate)
    lastYearStart.setUTCDate(lastYearStart.getUTCDate() - 364)
    lastYearEnd.setUTCDate(lastYearEnd.getUTCDate() - 364)
    const lastYearStartIso = toIsoDate(lastYearStart)
    const lastYearEndIso = toIsoDate(lastYearEnd)

    const [currentReports, previousReports, lastYearReports] = await Promise.all([
      fetchAllSiteReports(currentWeek.startDate, clampedToday),
      fetchAllSiteReports(previousWeek.startDate, previousWeek.endDate),
      fetchAllSiteReports(lastYearStartIso, lastYearEndIso),
    ])

    const reportTypes = [
      'overview',
      'devices',
      'channels',
      'search_terms',
      'top_pages',
      'categories',
      'brands',
      'items',
      'coupons',
      'items_viewed',
    ] as const

    const supabase = createServiceRoleClient()

    const { error: deleteError } = await supabase
      .from('ga4_site_reports')
      .delete()
      .in('period_type', ['current', 'previous', 'last_year'])

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const rows: SiteReportCacheRow[] = []

    for (const type of reportTypes) {
      const currentData = currentReports[type]
      const previousData = previousReports[type]
      const lastYearData = lastYearReports[type]

      if (currentData !== null) {
        rows.push({
          report_type: type,
          period_type: 'current',
          data: currentData,
          ad_week_number: currentWeek.adWeek,
          period_start: currentWeek.startDate,
          period_end: clampedToday,
        })
      }

      if (previousData !== null) {
        rows.push({
          report_type: type,
          period_type: 'previous',
          data: previousData,
          ad_week_number: previousWeek.adWeek,
          period_start: previousWeek.startDate,
          period_end: previousWeek.endDate,
        })
      }

      if (lastYearData !== null) {
        rows.push({
          report_type: type,
          period_type: 'last_year',
          data: lastYearData,
          ad_week_number: null,
          period_start: lastYearStartIso,
          period_end: lastYearEndIso,
        })
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('ga4_site_reports').insert(rows)
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ status: 'success', reports_stored: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh site reports'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const reportType = request.nextUrl.searchParams.get('report_type')

    if (reportType && !isReportType(reportType)) {
      return NextResponse.json({ error: 'Invalid report_type' }, { status: 400 })
    }

    let query = supabase
      .from('ga4_site_reports')
      .select('*')
      .order('fetched_at', { ascending: false })

    if (reportType) {
      query = query.eq('report_type', reportType)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as SiteReportCacheRow[]
    const grouped: Record<string, Record<string, unknown>> = {}

    for (const row of rows) {
      if (!grouped[row.report_type]) grouped[row.report_type] = {}
      if (grouped[row.report_type][row.period_type] !== undefined) continue
      grouped[row.report_type][row.period_type] = row.data
    }

    const currentRow = rows.find((row) => row.period_type === 'current')

    return NextResponse.json({
      reports: grouped,
      ad_week_number: currentRow?.ad_week_number ?? null,
      period_start: currentRow?.period_start ?? null,
      period_end: currentRow?.period_end ?? null,
      last_refreshed: currentRow?.fetched_at ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load site reports'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
