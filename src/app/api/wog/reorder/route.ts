import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { WogEventStatus } from '@/types/wog'

type ReorderUpdate = {
  id: string
  sort_order: number
  status: WogEventStatus
}

function isValidStatus(status: unknown): status is WogEventStatus {
  return status === 'upcoming' || status === 'past' || status === 'archived'
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { updates?: ReorderUpdate[] } | null
  const updates = body?.updates ?? []

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates are required' }, { status: 400 })
  }

  const isInvalid = updates.some(
    (update) =>
      !update?.id ||
      !Number.isInteger(update.sort_order) ||
      update.sort_order < 0 ||
      !isValidStatus(update.status),
  )

  if (isInvalid) {
    return NextResponse.json({ error: 'Invalid reorder payload' }, { status: 400 })
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('wog_events')
      .update({ sort_order: update.sort_order, status: update.status })
      .eq('id', update.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
