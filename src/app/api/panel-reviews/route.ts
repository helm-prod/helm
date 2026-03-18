import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type ReviewStatus = 'open' | 'addressed' | 'suppressed'
type ReviewPriority = 'normal' | 'elevated' | 'critical'
type UserRole = 'admin' | 'senior_web_producer' | 'producer' | 'wog_editor' | null

interface ReviewRow {
  id: string
  panel_fingerprint: string
  panel_image_url: string | null
  outbound_url: string | null
  source_page_url: string | null
  panel_name: string | null
  status: ReviewStatus
  priority: ReviewPriority
  suppress_scoring_until: string | null
  assigned_to: string | null
  assigned_by: string | null
  assigned_at: string | null
  addressed_by: string | null
  addressed_at: string | null
  created_at: string | null
  updated_at: string | null
}

interface CommentRow {
  id: string
  review_id: string
  author_id: string | null
  comment: string
  created_at: string | null
}

function canManageReviews(role: UserRole) {
  return role === 'admin' || role === 'senior_web_producer'
}

async function getActor() {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, role: null as UserRole }

  const { data: profile } = await supabase.from('profiles').select('id, role, full_name').eq('id', user.id).maybeSingle()
  return {
    user,
    role: (profile?.role ?? null) as UserRole,
    fullName: profile?.full_name ?? null,
  }
}

async function enrichReviews(service = createServiceRoleClient(), reviews: ReviewRow[]) {
  if (reviews.length === 0) return []

  const reviewIds = reviews.map((review) => review.id)
  const userIds = Array.from(new Set(
    reviews.flatMap((review) => [review.assigned_to, review.assigned_by, review.addressed_by]).filter(Boolean) as string[]
  ))

  const { data: commentsData, error: commentsError } = await service
    .from('panel_review_comments')
    .select('*')
    .in('review_id', reviewIds)
    .order('created_at', { ascending: true })

  if (commentsError) throw commentsError

  const comments = (commentsData ?? []) as CommentRow[]
  const commentAuthorIds = comments.map((comment) => comment.author_id).filter(Boolean) as string[]
  const allProfileIds = Array.from(new Set([...userIds, ...commentAuthorIds]))

  const { data: profilesData, error: profilesError } = allProfileIds.length > 0
    ? await service.from('profiles').select('id, full_name, role').in('id', allProfileIds)
    : { data: [], error: null }

  if (profilesError) throw profilesError

  const profileMap = new Map((profilesData ?? []).map((profile) => [profile.id, profile]))
  const commentsByReview = new Map<string, Array<CommentRow & { author_name: string }>>()

  for (const comment of comments) {
    const list = commentsByReview.get(comment.review_id) ?? []
    list.push({
      ...comment,
      author_name: comment.author_id ? profileMap.get(comment.author_id)?.full_name ?? 'Unknown' : 'Unknown',
    })
    commentsByReview.set(comment.review_id, list)
  }

  return reviews.map((review) => ({
    ...review,
    assigned_to_name: review.assigned_to ? profileMap.get(review.assigned_to)?.full_name ?? null : null,
    assigned_by_name: review.assigned_by ? profileMap.get(review.assigned_by)?.full_name ?? null : null,
    addressed_by_name: review.addressed_by ? profileMap.get(review.addressed_by)?.full_name ?? null : null,
    comments: commentsByReview.get(review.id) ?? [],
  }))
}

export async function GET(request: NextRequest) {
  const actor = await getActor()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const service = createServiceRoleClient()
    const status = request.nextUrl.searchParams.get('status')
    const assignedTo = request.nextUrl.searchParams.get('assigned_to')
    const fingerprint = request.nextUrl.searchParams.get('fingerprint')

    let query = service.from('panel_reviews').select('*').order('updated_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
    if (fingerprint) query = query.eq('panel_fingerprint', fingerprint)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const reviews = await enrichReviews(service, (data ?? []) as ReviewRow[])
    const { data: assignableUsers, error: usersError } = canManageReviews(actor.role)
      ? await service
        .from('profiles')
        .select('id, full_name, role')
        .neq('role', 'admin')
        .order('full_name', { ascending: true })
      : { data: [], error: null }

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    return NextResponse.json({
      reviews,
      currentUserId: actor.user.id,
      currentUserRole: actor.role,
      assignableUsers: assignableUsers ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const actor = await getActor()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      panel_fingerprint?: string
      panel_image_url?: string | null
      outbound_url?: string | null
      source_page_url?: string | null
      panel_name?: string | null
      priority?: ReviewPriority
      assigned_to?: string | null
      suppress_scoring_until?: string | null
      status?: ReviewStatus
    }

    if (!body.panel_fingerprint) {
      return NextResponse.json({ error: 'panel_fingerprint is required' }, { status: 400 })
    }

    const wantsManagedFields =
      Boolean(body.assigned_to) ||
      Boolean(body.suppress_scoring_until) ||
      body.priority === 'elevated' ||
      body.priority === 'critical' ||
      body.status === 'suppressed'

    if (wantsManagedFields && !canManageReviews(actor.role)) {
      return NextResponse.json({ error: 'Admin or senior producer access required' }, { status: 403 })
    }

    const service = createServiceRoleClient()
    const { data: existing } = await service
      .from('panel_reviews')
      .select('*')
      .eq('panel_fingerprint', body.panel_fingerprint)
      .maybeSingle()

    if (existing) {
      const [review] = await enrichReviews(service, [existing as ReviewRow])
      return NextResponse.json({ review, created: false })
    }

    const now = new Date().toISOString()
    const payload = {
      panel_fingerprint: body.panel_fingerprint,
      panel_image_url: body.panel_image_url ?? null,
      outbound_url: body.outbound_url ?? null,
      source_page_url: body.source_page_url ?? null,
      panel_name: body.panel_name ?? null,
      priority: body.priority ?? 'normal',
      status: body.status ?? (body.suppress_scoring_until ? 'suppressed' : 'open'),
      assigned_to: body.assigned_to ?? null,
      assigned_by: body.assigned_to ? actor.user.id : null,
      assigned_at: body.assigned_to ? now : null,
      suppress_scoring_until: body.suppress_scoring_until ?? null,
      updated_at: now,
    }

    const { data, error } = await service
      .from('panel_reviews')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const [review] = await enrichReviews(service, [data as ReviewRow])
    return NextResponse.json({ review, created: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getActor()
  if (!actor.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      id?: string
      status?: ReviewStatus
      priority?: ReviewPriority
      assigned_to?: string | null
      suppress_scoring_until?: string | null
      addressed_by?: string | null
      addressed_at?: string | null
    }

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const service = createServiceRoleClient()
    const { data: existing, error: existingError } = await service
      .from('panel_reviews')
      .select('*')
      .eq('id', body.id)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    const isManager = canManageReviews(actor.role)
    const isAssignedProducer = existing.assigned_to === actor.user.id

    if (!isManager) {
      const allowedKeys = Object.keys(body).filter((key) => key !== 'id')
      const allowedProducerKeys = ['status', 'addressed_by', 'addressed_at']
      const isValidProducerUpdate =
        isAssignedProducer &&
        body.status === 'addressed' &&
        allowedKeys.every((key) => allowedProducerKeys.includes(key))

      if (!isValidProducerUpdate) {
        return NextResponse.json({ error: 'You can only address reviews assigned to you' }, { status: 403 })
      }
    }

    const now = new Date().toISOString()
    const updatePayload: Record<string, string | null> = { updated_at: now }

    if (body.status !== undefined) updatePayload.status = body.status
    if (isManager && body.priority !== undefined) updatePayload.priority = body.priority
    if (isManager && Object.prototype.hasOwnProperty.call(body, 'assigned_to')) {
      updatePayload.assigned_to = body.assigned_to ?? null
      updatePayload.assigned_by = body.assigned_to ? actor.user.id : null
      updatePayload.assigned_at = body.assigned_to ? now : null
    }
    if (isManager && Object.prototype.hasOwnProperty.call(body, 'suppress_scoring_until')) {
      updatePayload.suppress_scoring_until = body.suppress_scoring_until ?? null
      if (body.suppress_scoring_until) updatePayload.status = 'suppressed'
    }
    if (body.status === 'addressed') {
      updatePayload.addressed_by = body.addressed_by ?? actor.user.id
      updatePayload.addressed_at = body.addressed_at ?? now
    }

    const { data, error } = await service
      .from('panel_reviews')
      .update(updatePayload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const [review] = await enrichReviews(service, [data as ReviewRow])
    return NextResponse.json({ review })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
