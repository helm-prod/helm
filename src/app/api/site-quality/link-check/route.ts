import { NextRequest, NextResponse } from 'next/server'
import { L1_PAGES } from '@/config/l1-pages'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { checkLink, extractPageLinks } from '@/lib/site-quality/link-checker'

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

type ResolveBody = {
  action?: 'resolve'
  id: string
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
    link_url: string | null
    source_type: string
    source_label: string
    panel_image: string
    slot: string
    ad_week: number | null
    ad_year: number | null
    http_status: number | null
    error_message: string | null
    redirect_target: string | null
    aor_owner: string
    is_broken: boolean
  }> = []

  try {
    const panels = await extractPageLinks(pageUrl)

    for (const panel of panels) {
      linksChecked += 1

      if (!panel.isLinked) {
        rows.push({
          run_id: runId,
          page_url: pageUrl,
          link_url: null,
          source_type: 'in-page',
          source_label: body.pageLabel,
          panel_image: panel.panelImage,
          slot: panel.slot,
          ad_week: panel.adWeek,
          ad_year: panel.adYear,
          http_status: null,
          error_message: 'Panel has no link (unlinked panel)',
          redirect_target: null,
          aor_owner: body.aorOwner,
          is_broken: true,
        })
        brokenFound += 1
        continue
      }

      const check = await checkLink(panel.url)
      const status = check.httpStatus
      const isBroken = status === null || status === 404 || status >= 400
      const isRedirect = status !== null && status >= 300 && status < 400

      if (status === 200) {
        continue
      }

      if (isBroken) brokenFound += 1
      if (isRedirect) redirectFound += 1

      rows.push({
        run_id: runId,
        page_url: pageUrl,
        link_url: panel.url,
        source_type: 'in-page',
        source_label: body.pageLabel,
        panel_image: panel.panelImage,
        slot: panel.slot,
        ad_week: panel.adWeek,
        ad_year: panel.adYear,
        http_status: status,
        error_message: check.errorMessage,
        redirect_target: check.redirectTarget,
        aor_owner: body.aorOwner,
        is_broken: isBroken,
      })
    }
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

export async function PATCH(request: NextRequest) {
  try {
    const auth = createAuthClient()
    const {
      data: { user },
    } = await auth.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as ResolveBody | null

    if (!body?.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('site_quality_link_results')
      .update({
        resolved: true,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', body.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
