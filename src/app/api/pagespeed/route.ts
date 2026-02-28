import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PagespeedResult } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

type Strategy = 'mobile' | 'desktop'

type PostBody = {
  urls: string[]
  strategy?: Strategy
}

type UrlError = {
  url: string
  error: string
}

type CruxMetric = {
  percentile?: number
  category?: string
}

type PageSpeedApiResponse = {
  lighthouseResult?: {
    categories?: {
      performance?: {
        score?: number
      }
    }
    audits?: Record<string, { numericValue?: number }>
  }
  loadingExperience?: {
    metrics?: Record<string, CruxMetric>
  }
}

type PagespeedInsertRow = Omit<PagespeedResult, 'id' | 'created_at'>

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const MAX_URLS_PER_REQUEST = 10
const CACHE_TTL_HOURS = 24

function createServiceRoleSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role is not configured')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mapCruxCategory(category?: string): string | null {
  if (!category) return null
  if (category === 'FAST') return 'good'
  if (category === 'AVERAGE') return 'needs-improvement'
  if (category === 'SLOW') return 'poor'
  return null
}

function getAuditNumericValue(
  audits: Record<string, { numericValue?: number }> | undefined,
  key: string
): number | null {
  return toNullableNumber(audits?.[key]?.numericValue)
}

function isStrategy(value: string): value is Strategy {
  return value === 'mobile' || value === 'desktop'
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value.trim())
    return parsed.toString()
  } catch {
    return null
  }
}

function toInsertRow(url: string, strategy: Strategy, response: PageSpeedApiResponse): PagespeedInsertRow {
  const lighthouse = response.lighthouseResult ?? null
  const audits = lighthouse?.audits
  const metrics = response.loadingExperience?.metrics

  const lcpMetric = metrics?.LARGEST_CONTENTFUL_PAINT_MS
  const clsMetric = metrics?.CUMULATIVE_LAYOUT_SHIFT
  const inpMetric = metrics?.INTERACTION_TO_NEXT_PAINT
  const fcpMetric = metrics?.FIRST_CONTENTFUL_PAINT_MS
  const ttfbMetric = metrics?.EXPERIMENTAL_TIME_TO_FIRST_BYTE
  const clsPercentile = toNullableNumber(clsMetric?.percentile)

  const performanceScoreRaw = toNullableNumber(lighthouse?.categories?.performance?.score)
  const performanceScore = performanceScoreRaw === null ? null : performanceScoreRaw * 100

  return {
    url,
    strategy,
    category: 'performance',
    performance_score: performanceScore,
    lcp_ms: getAuditNumericValue(audits, 'largest-contentful-paint'),
    cls: getAuditNumericValue(audits, 'cumulative-layout-shift'),
    inp_ms: getAuditNumericValue(audits, 'interaction-to-next-paint'),
    fcp_ms: getAuditNumericValue(audits, 'first-contentful-paint'),
    ttfb_ms: getAuditNumericValue(audits, 'server-response-time'),
    speed_index_ms: getAuditNumericValue(audits, 'speed-index'),
    total_blocking_time_ms: getAuditNumericValue(audits, 'total-blocking-time'),
    crux_lcp_p75_ms: toNullableNumber(lcpMetric?.percentile),
    crux_cls_p75: clsPercentile === null ? null : clsPercentile / 100,
    crux_inp_p75_ms: toNullableNumber(inpMetric?.percentile),
    crux_fcp_p75_ms: toNullableNumber(fcpMetric?.percentile),
    crux_ttfb_p75_ms: toNullableNumber(ttfbMetric?.percentile),
    lcp_rating: mapCruxCategory(lcpMetric?.category),
    cls_rating: mapCruxCategory(clsMetric?.category),
    inp_rating: mapCruxCategory(inpMetric?.category),
    raw_lighthouse: lighthouse,
    raw_crux: response.loadingExperience ?? null,
    fetched_at: new Date().toISOString(),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  const googleApiKey = process.env.GOOGLE_API_KEY
  if (!googleApiKey) {
    return NextResponse.json({ error: 'Google API key is not configured' }, { status: 503 })
  }

  let supabase
  try {
    supabase = createServiceRoleSupabaseClient()
  } catch (error) {
    console.error('Failed to create Supabase service client', error)
    return NextResponse.json({ error: 'Supabase service role is not configured' }, { status: 503 })
  }

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const strategyRaw = typeof body.strategy === 'string' ? body.strategy.trim().toLowerCase() : 'mobile'
  if (!isStrategy(strategyRaw)) {
    return NextResponse.json({ error: 'Invalid strategy. Use "mobile" or "desktop".' }, { status: 400 })
  }
  const strategy: Strategy = strategyRaw

  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json({ error: 'urls must be a non-empty array' }, { status: 400 })
  }

  if (body.urls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json(
      { error: `A maximum of ${MAX_URLS_PER_REQUEST} URLs is allowed per request` },
      { status: 400 }
    )
  }

  const results: PagespeedResult[] = []
  const errors: UrlError[] = []
  let cached = 0
  let fetched = 0
  let apiCallsMade = 0

  const cutoffIso = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()

  for (const candidateUrl of body.urls) {
    const normalizedUrl = normalizeUrl(String(candidateUrl))

    if (!normalizedUrl) {
      errors.push({ url: String(candidateUrl), error: 'Invalid URL' })
      continue
    }

    try {
      const { data: cachedRow, error: cacheError } = await supabase
        .from('pagespeed_cache')
        .select('*')
        .eq('url', normalizedUrl)
        .eq('strategy', strategy)
        .gte('fetched_at', cutoffIso)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cacheError) {
        throw new Error(`Cache lookup failed: ${cacheError.message}`)
      }

      if (cachedRow) {
        results.push(cachedRow as PagespeedResult)
        cached += 1
        continue
      }

      if (apiCallsMade > 0) {
        await sleep(1000)
      }
      apiCallsMade += 1

      const params = new URLSearchParams({
        url: normalizedUrl,
        key: googleApiKey,
        strategy,
        category: 'performance',
      })

      const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
        method: 'GET',
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`PageSpeed API request failed (${response.status}): ${errorBody}`)
      }

      const data = (await response.json()) as PageSpeedApiResponse
      const insertRow = toInsertRow(normalizedUrl, strategy, data)

      const { error: deleteError } = await supabase
        .from('pagespeed_cache')
        .delete()
        .eq('url', normalizedUrl)
        .eq('strategy', strategy)

      if (deleteError) {
        throw new Error(`Failed to clear old cache row: ${deleteError.message}`)
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from('pagespeed_cache')
        .insert(insertRow)
        .select('*')
        .single()

      if (insertError) {
        throw new Error(`Failed to cache PageSpeed result: ${insertError.message}`)
      }

      results.push(insertedRow as PagespeedResult)
      fetched += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ url: normalizedUrl, error: message })
    }
  }

  return NextResponse.json({ results, cached, fetched, errors })
}

export async function GET(request: NextRequest) {
  let supabase
  try {
    supabase = createServiceRoleSupabaseClient()
  } catch (error) {
    console.error('Failed to create Supabase service client', error)
    return NextResponse.json({ error: 'Supabase service role is not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const strategyParam = (searchParams.get('strategy') ?? 'mobile').trim().toLowerCase()

  if (!isStrategy(strategyParam)) {
    return NextResponse.json({ error: 'Invalid strategy. Use "mobile" or "desktop".' }, { status: 400 })
  }

  const category = searchParams.get('category')?.trim() || null
  const limitParam = searchParams.get('limit') ?? '20'
  const parsedLimit = Number.parseInt(limitParam, 10)

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 })
  }

  const limit = Math.min(parsedLimit, 100)

  let query = supabase
    .from('pagespeed_cache')
    .select('*')
    .eq('strategy', strategyParam)
    .order('fetched_at', { ascending: false })
    .limit(limit)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to load cached PageSpeed results', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: (data ?? []) as PagespeedResult[] })
}
