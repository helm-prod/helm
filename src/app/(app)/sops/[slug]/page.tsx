import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { SopDetailClient } from './sop-detail-client'
import { PageGuard } from '@/components/page-guard'

export default async function SOPDetailPage({
  params,
}: {
  params: { slug: string }
}) {
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

  const { data: sop } = await supabase
    .from('sop_documents')
    .select('*, creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
    .eq('slug', params.slug)
    .single()

  if (!sop) notFound()

  // Get user's acknowledgment for this SOP
  const { data: ack } = await supabase
    .from('sop_acknowledgments')
    .select('version_acknowledged')
    .eq('sop_id', sop.id)
    .eq('user_id', user.id)
    .order('version_acknowledged', { ascending: false })
    .limit(1)

  const ackedVersion = ack?.[0]?.version_acknowledged ?? 0

  return (
    <PageGuard pageSlug="sops">
      <SopDetailClient
        profile={profile as Profile}
        sop={sop}
        ackedVersion={ackedVersion}
      />
    </PageGuard>
  )
}
