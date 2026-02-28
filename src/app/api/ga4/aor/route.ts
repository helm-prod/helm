import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface AorPayload {
  id?: string
  profile_id: string
  category_label: string
  url_patterns: string[]
  is_homepage: boolean
}

function normalizeUrlPatterns(urlPatterns: unknown): string[] {
  if (!Array.isArray(urlPatterns)) {
    return []
  }

  return urlPatterns
    .map((value) => String(value).trim())
    .filter(Boolean)
}

async function requireAuthenticatedUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return user
}

export async function GET() {
  const user = await requireAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('ga4_aor_patterns')
    .select('*, profiles(full_name, email)')
    .order('category_label')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await requireAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as AorPayload

  if (!body.profile_id || !body.category_label) {
    return NextResponse.json({ error: 'profile_id and category_label are required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('ga4_aor_patterns')
    .insert({
      profile_id: body.profile_id,
      category_label: body.category_label.trim(),
      url_patterns: normalizeUrlPatterns(body.url_patterns),
      is_homepage: Boolean(body.is_homepage),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest) {
  const user = await requireAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as AorPayload

  if (!body.id || !body.profile_id || !body.category_label) {
    return NextResponse.json({ error: 'id, profile_id, and category_label are required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('ga4_aor_patterns')
    .update({
      profile_id: body.profile_id,
      category_label: body.category_label.trim(),
      url_patterns: normalizeUrlPatterns(body.url_patterns),
      is_homepage: Boolean(body.is_homepage),
    })
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id query param' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('ga4_aor_patterns').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'success' })
}
