import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import { SpeedDashboard } from '@/components/analytics/speed-dashboard'

export default async function SiteSpeedPage() {
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

  return (
    <PageGuard pageSlug="analytics-speed">
      <div className="max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-white">Site Speed</h1>
        <p className="mb-8 text-brand-400">Core Web Vitals and page load performance</p>
        <SpeedDashboard />
      </div>
    </PageGuard>
  )
}
