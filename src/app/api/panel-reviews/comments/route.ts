import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { review_id?: string; comment?: string }
    if (!body.review_id || !body.comment?.trim()) {
      return NextResponse.json({ error: 'review_id and comment are required' }, { status: 400 })
    }

    const service = createServiceRoleClient()
    const { data, error } = await service
      .from('panel_review_comments')
      .insert({
        review_id: body.review_id,
        author_id: user.id,
        comment: body.comment.trim(),
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: profile } = await service.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    return NextResponse.json({
      comment: {
        ...data,
        author_name: profile?.full_name ?? 'Unknown',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
