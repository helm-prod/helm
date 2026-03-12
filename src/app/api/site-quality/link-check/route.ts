import { NextRequest, NextResponse } from 'next/server'
import { L1_PAGES } from '@/config/l1-pages'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { checkLink } from '@/lib/site-quality/link-checker'

export const runtime = 'nodejs'

type StartBody = {
  action: 'start'
  scope?: 'all' | 'aor' | 'url'
  scopeValue?: string
  trigger?: 'manual' | 'scheduled'
}

type ScanPageBody = {
  action: 'scan-page'
  runId: string
  pageIndex: number
  pageUrl: string
  pageLabel: string
  aorOwner: string
  totalPages: number
}

function normalizeOwner(value: string | undefined) {
  if (!value) return ''
  return value.trim().toLowerCase()
}

function buildPageUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value
  const baseUrl = process.env.NEXCOM_SITE_URL ?? 'https://www.mynavyexchange.com'
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`
}

function filterPages(scope: 'all' | 'aor' | 'url', scopeValue?: string) {
  if (scope === 'aor' && scopeValue) {
    const owner = normalizeOwner(scopeValue)
    return L1_PAGES.filter((page) => normalizeOwner(page.aorOwner) === owner)
  }

  if (scope === 'url' && scopeValue) {
    const target = scopeValue.trim().toLowerCase()
    return L1_PAGES.filter((page) => buildPageUrl(page.url).toLowerCase() === target)
  }

  return [...L1_PAGES]
}

async function getRequestUserId(request: NextRequest, trigger: 'manual' | 'scheduled') {
  if (trigger === 'scheduled' || request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) {
    return null
  }

  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user?.id ?? null
}

function extractLinksFromHtml(html: string, pageUrl: string) {
  const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
  const links: string[] = []
  const dedupe = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1]
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue

    let absoluteUrl: string
    try {
      absoluteUrl = new URL(href, pageUrl).toString()
    } catch {
      continue
    }

    if (!absoluteUrl.includes('mynavyexchange.com')) continue
    if (dedupe.has(absoluteUrl)) continue
    dedupe.add(absoluteUrl)
    links.push(absoluteUrl)
  }

  return links
}

async function handleStart(body: StartBody, request: NextRequest) {
  const scope = body.scope ?? 'all'
  const scopeValue = body.scopeValue?.trim() || null
  const trigger = body.trigger ?? 'manual'
  const userId = await getRequestUserId(request, trigger)

  if (!userId && trigger !== 'scheduled') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pages = filterPages(scope, scopeValue ?? undefined).map((page) => ({
    label: page.label,
    url: page.url,
    aorOwner: page.aorOwner ?? '',
  }))

  const supabase = createServiceRoleClient()
  const { data: run, error } = await supabase
    .from('site_quality_link_runs')
    .insert({
      scope,
      scope_value: scopeValue,
      trigger,
      status: 'pending',
      pages_scanned: 0,
      links_checked: 0,
      broken_count: 0,
      redirect_count: 0,
      created_by: userId,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !run) {
    throw new Error(error?.message ?? 'Failed to create link scan run')
  }

  return NextResponse.json({
    runId: run.id,
    totalPages: pages.length,
    pages,
  })
}

async function handleScanPage(body: ScanPageBody) {
  const supabase = createServiceRoleClient()
  const runId = body.runId
  const pageUrl = buildPageUrl(body.pageUrl)
  const totalPages = body.totalPages

  if (body.pageIndex === 0) {
    const { error: startError } = await supabase
      .from('site_quality_link_runs')
      .update({ status: 'running' })
      .eq('id', runId)
    if (startError) {
      throw new Error(startError.message)
    }
  }

  let linksChecked = 0
  let brokenFound = 0
  let redirectFound = 0
  let rows: Array<{
    run_id: string
    page_url: string
    link_url: string
    source_type: string
    source_label: string
    http_status: number | null
    error_message: string | null
    redirect_target: string | null
    aor_owner: string
  }> = []

  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'HelmBot/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await response.text()
    const links = extractLinksFromHtml(html, pageUrl)

    linksChecked = links.length
    const checkedResults = await Promise.all(
      links.map(async (linkUrl) => {
        const checked = await checkLink(linkUrl)
        return { linkUrl, checked }
      }),
    )

    brokenFound = checkedResults.filter((item) => item.checked.httpStatus === 404 || item.checked.httpStatus === null).length
    redirectFound = checkedResults.filter((item) => item.checked.httpStatus !== null && item.checked.httpStatus >= 300 && item.checked.httpStatus < 400).length

    rows = checkedResults.map((item) => ({
      run_id: runId,
      page_url: pageUrl,
      link_url: item.linkUrl,
      source_type: 'in-page',
      source_label: body.pageLabel,
      http_status: item.checked.httpStatus,
      error_message: item.checked.errorMessage,
      redirect_target: item.checked.redirectTarget,
      aor_owner: body.aorOwner,
    }))
  } catch {
    linksChecked = 0
    brokenFound = 0
    redirectFound = 0
    rows = []
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('site_quality_link_results').insert(rows)
    if (insertError) {
      await supabase
        .from('site_quality_link_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', runId)
      throw new Error(insertError.message)
    }
  }

  const { data: run, error: runError } = await supabase
    .from('site_quality_link_runs')
    .select('pages_scanned, links_checked, broken_count, redirect_count')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    await supabase
      .from('site_quality_link_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', runId)
    throw new Error(runError?.message ?? 'Failed to load run counters')
  }

  const nextValues = {
    pages_scanned: (run.pages_scanned ?? 0) + 1,
    links_checked: (run.links_checked ?? 0) + linksChecked,
    broken_count: (run.broken_count ?? 0) + brokenFound,
    redirect_count: (run.redirect_count ?? 0) + redirectFound,
  }

  const isLastPage = body.pageIndex === totalPages - 1
  const updatePayload: Record<string, unknown> = {
    ...nextValues,
  }

  if (isLastPage) {
    updatePayload.status = 'complete'
    updatePayload.completed_at = new Date().toISOString()
  }

  const { error: updateError } = await supabase
    .from('site_quality_link_runs')
    .update(updatePayload)
    .eq('id', runId)

  if (updateError) {
    await supabase
      .from('site_quality_link_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', runId)
    throw new Error(updateError.message)
  }

  return NextResponse.json({
    runId,
    pageIndex: body.pageIndex,
    totalPages,
    linksChecked,
    brokenFound,
    isComplete: isLastPage,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as (StartBody | ScanPageBody | null)

    if (!body?.action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    if (body.action === 'start') {
      return await handleStart(body, request)
    }

    if (body.action === 'scan-page') {
      return await handleScanPage(body)
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
