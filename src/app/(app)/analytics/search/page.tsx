import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import { SearchPerformanceDashboard } from '@/components/analytics/search-performance-dashboard'
import { createClient } from '@/lib/supabase/server'

export default async function SearchPerformancePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  return (
    <PageGuard pageSlug="analytics-search">
      <div className="max-w-7xl">
        <SearchPerformanceDashboard isAdmin={profile.role === 'admin'} />
      </div>
    </PageGuard>
  )
}
