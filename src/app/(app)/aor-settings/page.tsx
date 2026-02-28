import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AorSettingsClient } from './aor-settings-client'
import { PageGuard } from '@/components/page-guard'
import { Ga4Mapping } from '@/components/aor-settings/ga4-mapping'

export default async function AorSettingsPage() {
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

  const { data: assignments } = await supabase
    .from('aor_assignments')
    .select('*, producer:profiles!producer_id(id, full_name, email)')
    .order('category')

  const { data: producers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['admin', 'senior_web_producer', 'producer'])
    .order('full_name')

  return (
    <PageGuard pageSlug="aor-settings">
      <div className="space-y-10">
        <AorSettingsClient
          assignments={assignments ?? []}
          producers={producers ?? []}
        />

        <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
          <h2 className="text-xl font-semibold text-white">GA4 Category Mapping</h2>
          <p className="mt-1 text-sm text-brand-400">
            Map producer AOR categories to site URL patterns for analytics tracking
          </p>
          <div className="mt-5">
            <Ga4Mapping profiles={producers ?? []} />
          </div>
        </section>
      </div>
    </PageGuard>
  )
}
