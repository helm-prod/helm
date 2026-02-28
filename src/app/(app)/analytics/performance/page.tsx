import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'

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

  return (
    <PageGuard pageSlug="analytics-performance">
      <div className="max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold text-white">Site Performance</h1>
        <p className="mb-8 text-brand-400">GA4 analytics deep-dive by category and producer</p>

        <div className="rounded-xl border border-brand-800 bg-brand-900 p-6 text-brand-300">
          Site Performance dashboard coming soon - this page will show detailed GA4 analytics broken down by producer AOR.
        </div>
      </div>
    </PageGuard>
  )
}
