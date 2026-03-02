import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runGscSync } from '@/lib/gsc/sync'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  }

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: user.id }
}

export async function POST() {
  const admin = await requireAdmin()
  if (admin.error) {
    return admin.error
  }

  try {
    const result = await runGscSync()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown GSC sync error'
    console.error('Manual GSC sync failed', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
