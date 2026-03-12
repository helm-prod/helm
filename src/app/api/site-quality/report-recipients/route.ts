import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

async function getSessionAndRole() {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: null }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { user, role: profile?.role ?? null }
}

export async function GET() {
  const actor = await getSessionAndRole()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('site_quality_report_recipients')
    .select('*')
    .eq('active', true)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recipients: data ?? [] })
}

export async function POST(request: NextRequest) {
  const actor = await getSessionAndRole()
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await request.json()) as {
    name?: string
    email?: string
    report_type?: 'full' | 'aor'
    aor_owner?: string | null
  }

  if (!body.name || !body.email || !body.report_type) {
    return NextResponse.json({ error: 'name, email, and report_type are required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('site_quality_report_recipients')
    .insert({
      name: body.name,
      email: body.email,
      report_type: body.report_type,
      aor_owner: body.report_type === 'aor' ? body.aor_owner ?? null : null,
      active: true,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recipient: data })
}

export async function DELETE(request: NextRequest) {
  const actor = await getSessionAndRole()
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('site_quality_report_recipients')
    .update({ active: false })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
