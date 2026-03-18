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
  const aorFilter = request.nextUrl.searchParams.get('aor')
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') ?? '50')))

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: run, error: runError } = await supabase
    .from('site_quality_panel_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  let query = supabase
    .from('site_quality_panel_results')
    .select('*', { count: 'exact' })
    .eq('run_id', runId)
    .order('score', { ascending: true })
    .order('created_at', { ascending: false })

  if (aorFilter) {
    query = query.eq('aor_owner', aorFilter)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data: results, error, count } = await query.range(from, to)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: triage, error: triageError } = await supabase
    .from('site_quality_page_triage')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })

  if (triageError) {
    return NextResponse.json({ error: triageError.message }, { status: 500 })
  }

  const { data: recentRuns, error: recentRunsError } = await supabase
    .from('site_quality_panel_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6)

  if (recentRunsError) {
    return NextResponse.json({ error: recentRunsError.message }, { status: 500 })
  }

  return NextResponse.json({ run, results: results ?? [], triage: triage ?? [], recentRuns: recentRuns ?? [], page, pageSize, total: count ?? 0 })
}
