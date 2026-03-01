import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CarouselManager } from '@/components/carousels/carousel-manager'
import { PageGuard } from '@/components/page-guard'
import type { Profile, HelmCarousel, HelmCarouselItem } from '@/lib/types/database'

export default async function CarouselsPage() {
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

  const [carouselsRes, itemsRes] = await Promise.all([
    supabase
      .from('helm_carousels')
      .select('*')
      .order('page_slug', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase
      .from('helm_carousel_items')
      .select('*')
      .order('sort_order', { ascending: true }),
  ])

  return (
    <PageGuard pageSlug="carousels">
      <CarouselManager
        currentUser={profile as Profile}
        initialCarousels={(carouselsRes.data ?? []) as HelmCarousel[]}
        initialItems={(itemsRes.data ?? []) as HelmCarouselItem[]}
      />
    </PageGuard>
  )
}
