import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const { data: events, error } = await supabase
    .from('wog_events')
    .select(
      'event_name, location, start_date, end_date, description, special_notes, event_image_url, cta1_title, cta1_link, cta2_title, cta2_link, status, sort_order',
    )
    .in('status', ['upcoming', 'past'])
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 })
  }

  const eventList = events ?? []

  return NextResponse.json(
    {
      upcoming: eventList.filter((event) => event.status === 'upcoming'),
      past: eventList.filter((event) => event.status === 'past'),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'Access-Control-Allow-Origin': 'https://www.mynavyexchange.com',
        'Access-Control-Allow-Methods': 'GET',
      },
    },
  )
}
