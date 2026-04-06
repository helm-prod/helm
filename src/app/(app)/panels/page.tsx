import { redirect } from 'next/navigation'
import { PanelHosting } from '@/components/panels/panel-hosting'
import { PageGuard } from '@/components/page-guard'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

export default async function PanelsPage() {
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
    <PageGuard pageSlug="panels">
      <PanelHosting profile={profile as Profile} />
    </PageGuard>
  )
}
