import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

type AuthMetadata = {
  email: string | null
  last_sign_in_at: string | null
  banned_until: string | null
}

type AuthUserRow = {
  id: string
  email: string | null
  last_sign_in_at: string | null
  banned_until: string | null
}

type ActionBody = {
  action?: 'reset_password' | 'toggle_lock' | 'update_email' | 'set_password'
  userId?: string
  email?: string
  banned?: boolean
  password?: string
}

async function requireAdmin() {
  const authClient = createServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse }
  }

  const { data: profile } = await authClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse }
  }

  return { userId: user.id }
}

function getServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 }) as NextResponse }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { error: NextResponse.json({ error: 'Supabase URL not configured.' }, { status: 500 }) as NextResponse }
  }

  try {
    return { client: createServiceRoleClient() }
  } catch {
    return { error: NextResponse.json({ error: 'Service role key not configured.' }, { status: 500 }) as NextResponse }
  }
}

function toUserRecord(rows: AuthUserRow[]) {
  const users: Record<string, AuthMetadata> = {}
  for (const row of rows) {
    users[row.id] = {
      email: row.email ?? null,
      last_sign_in_at: row.last_sign_in_at ?? null,
      banned_until: row.banned_until ?? null,
    }
  }
  return users
}

export async function GET() {
  const admin = await requireAdmin()
  if (admin.error) return admin.error

  const service = getServiceClient()
  if (service.error) return service.error

  const supabase = service.client

  // Approach 1: Supabase Auth Admin API pagination
  try {
    const rows: AuthUserRow[] = []
    const perPage = 200
    let page = 1

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) {
        throw error
      }

      const pageUsers = data?.users ?? []
      for (const user of pageUsers) {
        rows.push({
          id: user.id,
          email: user.email ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
          banned_until: user.banned_until ?? null,
        })
      }

      if (pageUsers.length < perPage) break
      page += 1
    }

    return NextResponse.json({ users: toUserRecord(rows) })
  } catch (error) {
    console.error('GET /api/admin/users approach 1 failed: auth.admin.listUsers()', error)
  }

  // Approach 2: direct auth schema query with service role client
  try {
    const { data, error } = await supabase
      .schema('auth')
      .from('users')
      .select('id, email, last_sign_in_at, banned_until')

    if (error) {
      throw error
    }

    return NextResponse.json({ users: toUserRecord((data ?? []) as AuthUserRow[]) })
  } catch (error) {
    console.error('GET /api/admin/users approach 2 failed: schema(auth).from(users)', error)
  }

  // Approach 3: fallback RPC (user-provided DB function)
  try {
    const { data, error } = await supabase.rpc('get_auth_users_admin')
    if (error) {
      throw error
    }

    return NextResponse.json({ users: toUserRecord((data ?? []) as AuthUserRow[]) })
  } catch (error) {
    console.error('GET /api/admin/users approach 3 failed: rpc(get_auth_users_admin)', error)
    return NextResponse.json(
      { error: 'Failed to fetch auth users metadata from all available approaches.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (admin.error) return admin.error

  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const action = body.action
  const userId = body.userId?.trim()

  if (!action || !userId) {
    return NextResponse.json({ error: 'Missing required fields: action and userId.' }, { status: 400 })
  }

  if (
    userId === admin.userId &&
    (action === 'toggle_lock' || action === 'update_email' || action === 'set_password')
  ) {
    return NextResponse.json({ error: 'You cannot perform this action on your own account.' }, { status: 400 })
  }

  const service = getServiceClient()
  if (service.error) return service.error
  const supabase = service.client

  if (action === 'reset_password') {
    let email = body.email?.trim() || ''

    if (!email) {
      const { data, error } = await supabase.auth.admin.getUserById(userId)
      if (error) {
        console.error(`POST /api/admin/users reset_password getUserById failed for user ${userId}`, error)
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      email = data.user?.email ?? ''
    }

    if (!email) {
      return NextResponse.json({ error: 'User email not found.' }, { status: 400 })
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) {
      console.error(`POST /api/admin/users reset_password failed for email ${email}`, error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset email sent',
      userId,
      email,
    })
  }

  if (action === 'toggle_lock') {
    if (typeof body.banned !== 'boolean') {
      return NextResponse.json({ error: 'Missing required field: banned.' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: body.banned ? '876000h' : 'none',
    })

    if (error) {
      console.error(`POST /api/admin/users toggle_lock failed for user ${userId}`, error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      userId,
      banned_until: data.user?.banned_until ?? null,
    })
  }

  if (action === 'update_email') {
    const nextEmail = body.email?.trim().toLowerCase()
    if (!nextEmail) {
      return NextResponse.json({ error: 'Missing required field: email.' }, { status: 400 })
    }

    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      email: nextEmail,
      email_confirm: true,
    })

    if (error) {
      console.error(`POST /api/admin/users update_email auth update failed for user ${userId}`, error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ email: nextEmail })
      .eq('id', userId)

    if (profileError) {
      console.error(`POST /api/admin/users update_email profile sync failed for user ${userId}`, profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      userId,
      email: data.user?.email ?? nextEmail,
      last_sign_in_at: data.user?.last_sign_in_at ?? null,
      banned_until: data.user?.banned_until ?? null,
    })
  }

  if (action === 'set_password') {
    const password = body.password || ''
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) {
      console.error(`POST /api/admin/users set_password failed for user ${userId}`, error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Password updated' })
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
}
