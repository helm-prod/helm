import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAdWeek } from '@/lib/ga4/ad-weeks'

export const dynamic = 'force-dynamic'

interface AorPatternRow {
  id: string
  profile_id: string
  category_label: string | null
  url_patterns: string[] | null
  is_homepage: boolean | null
  profiles:
    | {
      full_name: string | null
      email: string | null
    }[]
    | null
}

interface ExpandedPattern {
  profileId: string
  categoryLabel: string | null
  producerName: string | null
  pattern: string
}

type MetricRow = {
  page_path: string
  period_type: 'current_week' | 'previous_week' | string
  [key: string]: unknown
}

function normalizePatterns(row: AorPatternRow): ExpandedPattern[] {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : null
  const patterns = (row.url_patterns ?? []).map((value) => value.trim()).filter(Boolean)

  if (row.is_homepage) {
    patterns.push('/')
  }

  if (patterns.length === 0) {
    return []
  }

  const uniquePatterns = Array.from(new Set(patterns))

  return uniquePatterns.map((pattern) => ({
    profileId: row.profile_id,
    categoryLabel: row.category_label,
    producerName: profile?.full_name ?? null,
    pattern,
  }))
}

function matchesPattern(pagePath: string, pattern: string) {
  if (pattern === '/') {
    return pagePath === '/'
  }

  return pagePath.startsWith(pattern)
}

function findBestMatch(pagePath: string, patterns: ExpandedPattern[]) {
  let bestMatch: ExpandedPattern | null = null

  for (const pattern of patterns) {
    if (!matchesPattern(pagePath, pattern.pattern)) {
      continue
    }

    if (!bestMatch || pattern.pattern.length > bestMatch.pattern.length) {
      bestMatch = pattern
    }
  }

  return bestMatch
}

function splitByPeriodType(rows: Record<string, unknown>[]) {
  return {
    currentWeek: rows.filter((row) => row.period_type === 'current_week'),
    previousWeek: rows.filter((row) => row.period_type === 'previous_week'),
  }
}

function dedupeRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>()
  const deduped: Record<string, unknown>[] = []

  for (const row of rows) {
    const key = [row.page_path, row.period_start, row.period_end, row.period_type].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  return deduped
}

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') ?? 'site'
    const profileId = request.nextUrl.searchParams.get('profile_id')
    const supabase = createClient()

    const [metricsResult, logResult] = await Promise.all([
      supabase
        .from('ga4_page_metrics')
        .select('*')
        .in('period_type', ['current_week', 'previous_week']),
      supabase
        .from('ga4_fetch_log')
        .select('created_at')
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (metricsResult.error) {
      throw metricsResult.error
    }

    const allMetrics = (metricsResult.data ?? []) as MetricRow[]

    let filteredRows: Record<string, unknown>[] = allMetrics

    if (scope === 'aor') {
      const patternQuery = supabase
        .from('ga4_aor_patterns')
        .select('id, profile_id, category_label, url_patterns, is_homepage, profiles(full_name, email)')

      const patternResult = profileId
        ? await patternQuery.eq('profile_id', profileId)
        : await patternQuery

      if (patternResult.error) {
        throw patternResult.error
      }

      const patterns = ((patternResult.data ?? []) as AorPatternRow[]).flatMap(normalizePatterns)

      const scopedRows: Record<string, unknown>[] = []

      for (const metricRow of allMetrics) {
        const pagePath = metricRow.page_path
        const match = findBestMatch(pagePath, patterns)

        if (!match) {
          continue
        }

        scopedRows.push({
          ...metricRow,
          category_label: match.categoryLabel,
          producer_name: match.producerName,
        })
      }

      filteredRows = dedupeRows(scopedRows)
    } else if (scope !== 'site') {
      return NextResponse.json({ error: 'Invalid scope. Use "site" or "aor".' }, { status: 400 })
    }

    const { currentWeek, previousWeek } = splitByPeriodType(filteredRows)
    const currentAdWeek = getCurrentAdWeek()

    return NextResponse.json({
      current_week: currentWeek,
      previous_week: previousWeek,
      last_refreshed: logResult.data?.created_at ?? null,
      ad_week: {
        week_number: currentAdWeek.adWeek,
        start_date: currentAdWeek.startDate,
        end_date: currentAdWeek.endDate,
        notes: currentAdWeek.notes,
      },
    })
  } catch (error) {
    console.error('Failed to load GA4 metrics', error)
    const message = error instanceof Error ? error.message : 'Unable to load analytics data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
