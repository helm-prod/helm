import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { WogEvent, WogEventStatus } from '@/types/wog'

type CreateWogEventBody = Omit<WogEvent, 'id' | 'created_at' | 'updated_at'>
type UpdateWogEventBody = Partial<CreateWogEventBody> & { id: string }

function isValidStatus(status: unknown): status is WogEventStatus {
  return status === 'upcoming' || status === 'past' || status === 'archived'
}

async function requireUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { supabase, user }
}

export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { supabase } = auth
  const { data, error } = await supabase
    .from('wog_events')
    .select('*')
    .order('status', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { supabase } = auth
  const body = (await request.json().catch(() => null)) as CreateWogEventBody | null

  if (!body?.event_name?.trim() || !body.start_date || !body.description?.trim() || !body.event_image_url?.trim()) {
    return NextResponse.json(
      { error: 'event_name, start_date, description, and event_image_url are required' },
      { status: 400 },
    )
  }

  if (!isValidStatus(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const payload = {
    ...body,
    event_name: body.event_name.trim(),
    location: body.location?.trim() || null,
    description: body.description.trim(),
    special_notes: body.special_notes?.trim() || null,
    event_image_url: body.event_image_url.trim(),
    cta1_title: body.cta1_title?.trim() || null,
    cta1_link: body.cta1_link?.trim() || null,
    cta2_title: body.cta2_title?.trim() || null,
    cta2_link: body.cta2_link?.trim() || null,
  }

  const { data, error } = await supabase
    .from('wog_events')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { supabase } = auth
  const body = (await request.json().catch(() => null)) as UpdateWogEventBody | null

  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from('wog_events')
    .select('id, status, sort_order')
    .eq('id', body.id)
    .maybeSingle()

  if (existingEventError) {
    return NextResponse.json({ error: existingEventError.message }, { status: 500 })
  }

  if (!existingEvent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    if (key === 'id' || value === undefined) continue

    if (typeof value === 'string') {
      const trimmed = value.trim()
      updates[key] = trimmed || null
      continue
    }

    updates[key] = value
  }

  if (updates.event_name === null || updates.description === null || updates.event_image_url === null) {
    return NextResponse.json(
      { error: 'event_name, description, and event_image_url cannot be empty' },
      { status: 400 },
    )
  }

  if (body.status && body.status !== existingEvent.status) {
    const { data: destinationEvents, error: destinationError } = await supabase
      .from('wog_events')
      .select('id, status')
      .eq('status', body.status)
      .neq('id', body.id)
      .order('sort_order', { ascending: true })

    if (destinationError) {
      return NextResponse.json({ error: destinationError.message }, { status: 500 })
    }

    const shiftUpdates = (destinationEvents ?? []).map((event, index) => ({
      id: event.id,
      status: body.status as WogEventStatus,
      sort_order: index + 1,
    }))

    if (shiftUpdates.length > 0) {
      const { error: shiftError } = await supabase.from('wog_events').upsert(shiftUpdates, { onConflict: 'id' })
      if (shiftError) {
        return NextResponse.json({ error: shiftError.message }, { status: 500 })
      }
    }

    updates.sort_order = 0
  }

  const { data, error } = await supabase
    .from('wog_events')
    .update(updates)
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ event: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { supabase } = auth
  const body = (await request.json().catch(() => null)) as { id?: string } | null

  if (!body?.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase.from('wog_events').delete().eq('id', body.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
