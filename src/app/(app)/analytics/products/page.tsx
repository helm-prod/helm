import { redirect } from 'next/navigation'
import { ProductsAnalyticsDashboard } from '@/components/analytics/products-analytics-dashboard'
import { PageGuard } from '@/components/page-guard'
import { createClient } from '@/lib/supabase/server'

export default async function ProductAnalyticsPage() {
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
    <PageGuard pageSlug="analytics-products">
      <div className="max-w-7xl">
        <ProductsAnalyticsDashboard isAdmin={profile.role === 'admin'} />
      </div>
    </PageGuard>
  )
}
