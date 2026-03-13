import { redirect } from 'next/navigation'
import { PageGuard } from '@/components/page-guard'
import WogManager from '@/components/wog/wog-manager'
import { createClient } from '@/lib/supabase/server'
import type { WogEvent } from '@/types/wog'

export default async function WogPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: events } = await supabase
    .from('wog_events')
    .select('*')
    .order('status', { ascending: true })
    .order('sort_order', { ascending: true })

  return (
    <PageGuard pageSlug="wog">
      <div className="max-w-[1600px]">
        <WogManager initialEvents={(events as WogEvent[] | null) ?? []} />
      </div>
    </PageGuard>
  )
}
