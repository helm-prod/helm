import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const STATIC_ALLOWED_ORIGINS = [
  'https://www.mynavyexchange.com',
  'https://mynavyexchange.com',
  'http://localhost:3000',
]

const VALID_LANGUAGES = new Set(['html', 'css', 'javascript', 'typescript', 'json', 'markdown'])
const VALID_VISIBILITIES = new Set(['private', 'team'])

type UserRole = 'admin' | 'senior_web_producer' | 'producer' | 'wog_editor' | null

type EditorFileRow = {
  id: string
  user_id: string
  folder_id: string | null
  team_folder_id: string | null
  title: string
  language: string
  content: string
  visibility: string
  is_template: boolean | null
  tags: string[] | null
  created_at: string | null
  updated_at: string | null
}

type UpdateFileBody = {
  title?: unknown
  content?: unknown
  language?: unknown
  visibility?: unknown
  tags?: unknown
  folder_id?: unknown
  team_folder_id?: unknown
}

function createAuthClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Middleware handles session refresh for route handlers.
          }
        },
      },
    },
  )
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return value.replace(/\/+$/, '')
  }
}

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    return `${protocol}://${forwardedHost}`
  }

  const host = request.headers.get('host')
  if (host) {
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    return `${protocol}://${host}`
  }

  return request.nextUrl.origin
}

function getAllowedOrigins(request: NextRequest) {
  const allowedOrigins = new Set(STATIC_ALLOWED_ORIGINS)
  const runtimeOrigin = getRequestOrigin(request)
  if (runtimeOrigin) {
    allowedOrigins.add(normalizeOrigin(runtimeOrigin))
  }

  const envOrigins = [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
    (value): value is string => Boolean(value),
  )
  for (const envOrigin of envOrigins) {
    allowedOrigins.add(normalizeOrigin(envOrigin))
  }

  return allowedOrigins
}

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin')
  const allowedOrigins = getAllowedOrigins(request)
  const fallbackOrigin = normalizeOrigin(getRequestOrigin(request) || STATIC_ALLOWED_ORIGINS[0])
  const allowedOrigin =
    origin && allowedOrigins.has(normalizeOrigin(origin)) ? normalizeOrigin(origin) : fallbackOrigin

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function jsonResponse(request: NextRequest, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...getCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  })
}

function isValidUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function parseOptionalUuid(value: unknown) {
  if (value === undefined) return { ok: true as const, value: undefined }
  if (value === null) return { ok: true as const, value: null }
  if (isValidUuid(value)) return { ok: true as const, value }
  return { ok: false as const }
}

function normalizeTags(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
    return null
  }

  return Array.from(
    new Set(
      value
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )
}

async function getActor() {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, role: null as UserRole }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return {
    user,
    role: (profile?.role ?? null) as UserRole,
  }
}

async function getFileById(id: string) {
  const service = createServiceRoleClient()
  const { data, error } = await service.from('editor_files').select('*').eq('id', id).maybeSingle()
  return { data: (data ?? null) as EditorFileRow | null, error }
}

function canModifyFile(actorUserId: string, actorRole: UserRole, file: EditorFileRow) {
  return file.user_id === actorUserId || actorRole === 'admin'
}

function normalizeUpdatePayload(body: UpdateFileBody, existing: EditorFileRow) {
  const hasKnownField =
    body.title !== undefined ||
    body.content !== undefined ||
    body.language !== undefined ||
    body.visibility !== undefined ||
    body.tags !== undefined ||
    body.folder_id !== undefined ||
    body.team_folder_id !== undefined

  if (!hasKnownField) {
    return { error: 'No updatable fields provided' }
  }

  const next: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return { error: 'title must be a non-empty string' }
    }
    next.title = title
  }

  if (body.content !== undefined) {
    if (typeof body.content !== 'string') {
      return { error: 'content must be a string' }
    }
    next.content = body.content
  }

  if (body.language !== undefined) {
    if (typeof body.language !== 'string' || !VALID_LANGUAGES.has(body.language)) {
      return { error: 'language must be one of html, css, javascript, typescript, json, markdown' }
    }
    next.language = body.language
  }

  if (body.visibility !== undefined) {
    if (typeof body.visibility !== 'string' || !VALID_VISIBILITIES.has(body.visibility)) {
      return { error: 'visibility must be private or team' }
    }
    next.visibility = body.visibility
  }

  const tags = normalizeTags(body.tags)
  if (tags === null) {
    return { error: 'tags must be an array of strings' }
  }
  if (tags !== undefined) {
    next.tags = tags
  }

  const folderId = parseOptionalUuid(body.folder_id)
  const teamFolderId = parseOptionalUuid(body.team_folder_id)
  if (!folderId.ok || !teamFolderId.ok) {
    return { error: 'folder_id and team_folder_id must be valid UUIDs when provided' }
  }

  const resolvedVisibility = (next.visibility as string | undefined) ?? existing.visibility
  let resolvedFolderId = folderId.value === undefined ? existing.folder_id : folderId.value
  let resolvedTeamFolderId = teamFolderId.value === undefined ? existing.team_folder_id : teamFolderId.value

  if (body.folder_id !== undefined && folderId.value) {
    resolvedTeamFolderId = null
  }
  if (body.team_folder_id !== undefined && teamFolderId.value) {
    resolvedFolderId = null
  }

  if (resolvedFolderId && resolvedTeamFolderId) {
    return { error: 'Provide either folder_id or team_folder_id, not both' }
  }

  if (resolvedVisibility === 'private') {
    if (body.team_folder_id !== undefined && teamFolderId.value) {
      return { error: 'team_folder_id requires visibility to be team' }
    }
    resolvedTeamFolderId = null
  }

  if (resolvedVisibility === 'team') {
    if (body.folder_id !== undefined && folderId.value) {
      return { error: 'folder_id requires visibility to be private' }
    }
    resolvedFolderId = null
  }

  if (body.folder_id !== undefined || resolvedFolderId !== existing.folder_id) {
    next.folder_id = resolvedFolderId
  }
  if (body.team_folder_id !== undefined || resolvedTeamFolderId !== existing.team_folder_id) {
    next.team_folder_id = resolvedTeamFolderId
  }
  if (body.visibility !== undefined) {
    next.visibility = resolvedVisibility
  }

  next.updated_at = new Date().toISOString()

  return { data: next }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor()
  if (!actor.user) {
    return jsonResponse(request, { error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return jsonResponse(request, { error: 'Invalid file id' }, { status: 400 })
  }

  try {
    const service = createServiceRoleClient()
    const { data, error } = await service
      .from('editor_files')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${actor.user.id},visibility.eq.team`)
      .maybeSingle()

    if (error) {
      console.error(`GET /api/editor-files/${id} failed`, error)
      return jsonResponse(request, { error: error.message }, { status: 500 })
    }

    if (!data) {
      return jsonResponse(request, { error: 'File not found' }, { status: 404 })
    }

    return jsonResponse(request, data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error(`GET /api/editor-files/${id} failed unexpectedly`, error)
    return jsonResponse(request, { error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor()
  if (!actor.user) {
    return jsonResponse(request, { error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return jsonResponse(request, { error: 'Invalid file id' }, { status: 400 })
  }

  let body: UpdateFileBody
  try {
    body = (await request.json()) as UpdateFileBody
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const { data: existing, error: fetchError } = await getFileById(id)
    if (fetchError) {
      console.error(`PATCH /api/editor-files/${id} lookup failed`, fetchError)
      return jsonResponse(request, { error: fetchError.message }, { status: 500 })
    }

    if (!existing) {
      return jsonResponse(request, { error: 'File not found' }, { status: 404 })
    }

    if (!canModifyFile(actor.user.id, actor.role, existing)) {
      return jsonResponse(request, { error: 'File not found' }, { status: 404 })
    }

    const normalized = normalizeUpdatePayload(body, existing)
    if ('error' in normalized) {
      return jsonResponse(request, { error: normalized.error }, { status: 400 })
    }

    const service = createServiceRoleClient()
    const { data, error } = await service
      .from('editor_files')
      .update(normalized.data)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error(`PATCH /api/editor-files/${id} failed`, error)
      return jsonResponse(request, { error: error.message }, { status: 500 })
    }

    return jsonResponse(request, data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error(`PATCH /api/editor-files/${id} failed unexpectedly`, error)
    return jsonResponse(request, { error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor()
  if (!actor.user) {
    return jsonResponse(request, { error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return jsonResponse(request, { error: 'Invalid file id' }, { status: 400 })
  }

  try {
    const { data: existing, error: fetchError } = await getFileById(id)
    if (fetchError) {
      console.error(`DELETE /api/editor-files/${id} lookup failed`, fetchError)
      return jsonResponse(request, { error: fetchError.message }, { status: 500 })
    }

    if (!existing) {
      return jsonResponse(request, { error: 'File not found' }, { status: 404 })
    }

    if (!canModifyFile(actor.user.id, actor.role, existing)) {
      return jsonResponse(request, { error: 'File not found' }, { status: 404 })
    }

    const service = createServiceRoleClient()
    const { error } = await service.from('editor_files').delete().eq('id', id)
    if (error) {
      console.error(`DELETE /api/editor-files/${id} failed`, error)
      return jsonResponse(request, { error: error.message }, { status: 500 })
    }

    return jsonResponse(request, { success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error(`DELETE /api/editor-files/${id} failed unexpectedly`, error)
    return jsonResponse(request, { error: message }, { status: 500 })
  }
}
