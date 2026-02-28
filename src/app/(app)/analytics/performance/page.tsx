import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import { PerformanceDashboard } from '@/components/analytics/performance-dashboard'
import type { Profile } from '@/lib/types/database'

export default async function SitePerformancePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  const p = profile as Profile

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['admin', 'senior_web_producer', 'producer'])
    .order('full_name')

  return (
    <PageGuard pageSlug="analytics-performance">
      <div className="max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-white">Site Performance</h1>
        <p className="mb-8 text-brand-400">GA4 analytics deep-dive by category and producer</p>
        <PerformanceDashboard profileId={p.id} allProfiles={allProfiles ?? []} userRole={p.role} />
      </div>
    </PageGuard>
  )
}
