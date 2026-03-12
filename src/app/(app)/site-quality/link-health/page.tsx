import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import { LinkHealthDashboard } from '@/components/site-quality/link-health-dashboard'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { getRecipients } from '@/lib/site-quality/report-recipients'
import type { Profile } from '@/lib/types/database'

export default async function LinkHealthPage() {
  const auth = createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await auth.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const supabase = createServiceRoleClient()
  const { data: run } = await supabase
    .from('site_quality_link_runs')
    .select('*')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: results } = run
    ? await supabase.from('site_quality_link_results').select('*').eq('run_id', run.id).order('created_at', { ascending: false }).limit(100)
    : { data: [] }

  const recipients = (profile as Profile).role === 'admin' ? await getRecipients().catch(() => []) : []

  return (
    <PageGuard pageSlug="site-quality-link-health">
      <div className="max-w-7xl">
        <LinkHealthDashboard initialRun={run} initialResults={results ?? []} initialRecipients={recipients} userRole={(profile as Profile).role} />
      </div>
    </PageGuard>
  )
}
