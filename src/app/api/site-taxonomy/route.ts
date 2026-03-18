import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type UserRole = 'admin' | 'senior_web_producer' | 'producer' | 'wog_editor' | null

async function getActor() {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, role: null as UserRole }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return {
    user,
    role: (profile?.role ?? null) as UserRole,
  }
}

export async function GET(request: NextRequest) {
  const actor = await getActor()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const monitoredOnly = request.nextUrl.searchParams.get('monitored') === 'true'
  const service = createServiceRoleClient()

  let query = service
    .from('site_taxonomy')
    .select('*')
    .order('depth', { ascending: true })
    .order('label', { ascending: true })

  if (monitoredOnly) {
    query = query.eq('is_monitored', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function PATCH(request: NextRequest) {
  const actor = await getActor()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { url?: string; is_monitored?: boolean } | null
  if (!body?.url || typeof body.is_monitored !== 'boolean') {
    return NextResponse.json({ error: 'url and is_monitored required' }, { status: 400 })
  }

  const service = createServiceRoleClient()
  const { data, error } = await service
    .from('site_taxonomy')
    .update({ is_monitored: body.is_monitored, updated_at: new Date().toISOString() })
    .eq('url', body.url)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
