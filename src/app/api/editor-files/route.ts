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
const LIST_SELECT = 'id, title, language, folder_id, team_folder_id, visibility, tags, created_at, updated_at'

type CreateFileBody = {
  title?: unknown
  content?: unknown
  language?: unknown
  folder_id?: unknown
  team_folder_id?: unknown
  visibility?: unknown
  tags?: unknown
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function normalizeCreatePayload(body: CreateFileBody) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return { error: 'title is required' }
  }

  if (typeof body.content !== 'string') {
    return { error: 'content is required' }
  }

  const language = body.language === undefined ? 'html' : body.language
  if (typeof language !== 'string' || !VALID_LANGUAGES.has(language)) {
    return { error: 'language must be one of html, css, javascript, typescript, json, markdown' }
  }

  const folderId = parseOptionalUuid(body.folder_id)
  const teamFolderId = parseOptionalUuid(body.team_folder_id)
  if (!folderId.ok || !teamFolderId.ok) {
    return { error: 'folder_id and team_folder_id must be valid UUIDs when provided' }
  }

  if (folderId.value && teamFolderId.value) {
    return { error: 'Provide either folder_id or team_folder_id, not both' }
  }

  const inferredVisibility = teamFolderId.value ? 'team' : 'private'
  const visibility = body.visibility === undefined ? inferredVisibility : body.visibility
  if (typeof visibility !== 'string' || !VALID_VISIBILITIES.has(visibility)) {
    return { error: 'visibility must be private or team' }
  }

  if (visibility === 'private' && teamFolderId.value) {
    return { error: 'team_folder_id requires visibility to be team' }
  }

  if (visibility === 'team' && folderId.value) {
    return { error: 'folder_id requires visibility to be private' }
  }

  const tags = normalizeTags(body.tags)
  if (tags === null) {
    return { error: 'tags must be an array of strings' }
  }

  return {
    data: {
      title,
      content: body.content,
      language,
      folder_id: visibility === 'private' ? (folderId.value ?? null) : null,
      team_folder_id: visibility === 'team' ? (teamFolderId.value ?? null) : null,
      visibility,
      tags: tags ?? [],
    },
  }
}

async function getSessionUser() {
  const supabase = createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) })
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return jsonResponse(request, { error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const service = createServiceRoleClient()
    const folderId = request.nextUrl.searchParams.get('folder_id')
    const title = request.nextUrl.searchParams.get('title')?.trim()
    const search = request.nextUrl.searchParams.get('search')?.trim()

    if (folderId && !isValidUuid(folderId)) {
      return jsonResponse(request, { error: 'folder_id must be a valid UUID' }, { status: 400 })
    }

    let query = service
      .from('editor_files')
      .select(LIST_SELECT)
      .or(`user_id.eq.${user.id},visibility.eq.team`)
      .order('updated_at', { ascending: false })

    if (folderId) {
      query = query.or(`folder_id.eq.${folderId},team_folder_id.eq.${folderId}`)
    }

    if (title) {
      query = query.ilike('title', title)
    }

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      console.error('GET /api/editor-files failed', error)
      return jsonResponse(request, { error: error.message }, { status: 500 })
    }

    return jsonResponse(request, data ?? [])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('GET /api/editor-files failed unexpectedly', error)
    return jsonResponse(request, { error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return jsonResponse(request, { error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateFileBody
  try {
    body = (await request.json()) as CreateFileBody
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON body' }, { status: 400 })
  }

  const normalized = normalizeCreatePayload(body)
  if ('error' in normalized) {
    return jsonResponse(request, { error: normalized.error }, { status: 400 })
  }

  try {
    const service = createServiceRoleClient()
    const { data, error } = await service
      .from('editor_files')
      .insert({
        user_id: user.id,
        is_template: false,
        ...normalized.data,
      })
      .select('*')
      .single()

    if (error) {
      console.error('POST /api/editor-files failed', error)
      return jsonResponse(request, { error: error.message }, { status: 500 })
    }

    return jsonResponse(request, data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('POST /api/editor-files failed unexpectedly', error)
    return jsonResponse(request, { error: message }, { status: 500 })
  }
}
