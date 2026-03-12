import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const auth = createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = request.nextUrl.searchParams.get('runId')
  const statusFilter = request.nextUrl.searchParams.get('status') ?? 'all'
  const aorFilter = request.nextUrl.searchParams.get('aor')
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') ?? '50')))

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: run, error: runError } = await supabase
    .from('site_quality_link_runs')
    .select('id, status, pages_scanned, links_checked, broken_count, redirect_count, started_at, completed_at, created_at, scope, scope_value, trigger, created_by')
    .eq('id', runId)
    .maybeSingle()

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  let query = supabase
    .from('site_quality_link_results')
    .select('*', { count: 'exact' })
    .eq('run_id', runId)
    .order('http_status', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })

  if (statusFilter === 'broken') {
    query = query.or('http_status.eq.404,error_message.not.is.null')
  }

  if (aorFilter) {
    query = query.eq('aor_owner', aorFilter)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data: results, error, count } = await query.range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ run, results: results ?? [], page, pageSize, total: count ?? 0 })
}
