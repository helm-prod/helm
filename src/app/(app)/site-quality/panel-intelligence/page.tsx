import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import { PanelIntelligenceDashboard } from '@/components/site-quality/panel-intelligence-dashboard'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { getRecipients } from '@/lib/site-quality/report-recipients'
import type { SiteQualityPageTriage } from '@/lib/site-quality/types'
import type { Profile } from '@/lib/types/database'

export default async function PanelIntelligencePage() {
  const auth = createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await auth.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const supabase = createServiceRoleClient()
  const { data: run } = await supabase
    .from('site_quality_panel_runs')
    .select('*')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: results } = run
    ? await supabase.from('site_quality_panel_results').select('*').eq('run_id', run.id).order('score', { ascending: true }).limit(100)
    : { data: [] }
  const { data: triage } = run
    ? await supabase.from('site_quality_page_triage').select('*').eq('run_id', run.id).order('created_at', { ascending: false })
    : { data: [] as SiteQualityPageTriage[] }
  const { data: recentRuns } = await supabase
    .from('site_quality_panel_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6)

  const recipients = (profile as Profile).role === 'admin' ? await getRecipients().catch(() => []) : []

  return (
    <PageGuard pageSlug="site-quality-panel-intelligence">
      <div className="max-w-7xl">
        <PanelIntelligenceDashboard initialRun={run} initialResults={results ?? []} initialTriage={triage ?? []} initialRecentRuns={recentRuns ?? []} initialRecipients={recipients} userRole={(profile as Profile).role} />
      </div>
    </PageGuard>
  )
}
