import type { SupabaseClient } from '@supabase/supabase-js'
import { NAV_ITEMS, NON_ADMIN_ROLES } from '@/lib/nav-config'
import { normalizeUserRole, WOG_EDITOR_ALLOWED_SLUGS } from '@/lib/roles'
import type { UserRole } from '@/lib/types/database'

type PageAccessRow = {
  page_slug: string
  role: UserRole
  is_enabled: boolean
}

type UserOverrideRow = {
  page_slug: string
  is_enabled: boolean
}

const ALWAYS_ENABLED_SLUGS = new Set<string>([
  'bugs',
  'site-quality-link-health',
  'site-quality-panel-intelligence',
])

function getRoleDefault(role: UserRole, pageSlug: string): boolean {
  if (ALWAYS_ENABLED_SLUGS.has(pageSlug)) return true
  if (role === 'wog_editor') return WOG_EDITOR_ALLOWED_SLUGS.includes(pageSlug)
  if (role === 'senior_web_producer') return true
  return false
}

export async function getUserRole(supabase: SupabaseClient): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return 'producer'
  }

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return normalizeUserRole(data?.role)
}

export async function getEffectiveAccess(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole,
): Promise<Set<string>> {
  if (role === 'admin') {
    return new Set(NAV_ITEMS.map((item) => item.slug))
  }

  const [defaultsRes, overridesRes] = await Promise.all([
    supabase
      .from('page_access')
      .select('page_slug, role, is_enabled')
      .eq('role', role),
    supabase
      .from('user_page_overrides')
      .select('page_slug, is_enabled')
      .eq('user_id', userId),
  ])

  const defaultsMap = new Map<string, boolean>()
  for (const row of (defaultsRes.data ?? []) as PageAccessRow[]) {
    defaultsMap.set(row.page_slug, row.is_enabled)
  }

  const effective = new Set<string>()

  for (const item of NAV_ITEMS) {
    if (item.adminOnly) {
      continue
    }

    if (defaultsMap.has(item.slug)) {
      if (defaultsMap.get(item.slug)) {
        effective.add(item.slug)
      }
      continue
    }

    if (getRoleDefault(role, item.slug)) {
      effective.add(item.slug)
    }
  }

  for (const row of (overridesRes.data ?? []) as UserOverrideRow[]) {
    const item = NAV_ITEMS.find((navItem) => navItem.slug === row.page_slug)

    if (!item || item.adminOnly) {
      continue
    }

    if (row.is_enabled) {
      effective.add(row.page_slug)
    } else {
      effective.delete(row.page_slug)
    }
  }

  return effective
}

export async function checkPageAccess(
  supabase: SupabaseClient,
  pageSlug: string,
): Promise<boolean> {
  const item = NAV_ITEMS.find((navItem) => navItem.slug === pageSlug)

  if (!item) {
    return false
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return false
  }

  const role = await getUserRole(supabase)

  if (item.adminOnly && role !== 'admin') {
    return false
  }

  const effectiveAccess = await getEffectiveAccess(supabase, user.id, role)
  return effectiveAccess.has(pageSlug)
}

export async function ensurePageAccessRows(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<void> {
  const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)))

  if (uniqueSlugs.length === 0) {
    return
  }

  const roles = NON_ADMIN_ROLES.map((role) => role.value)

  const { data: existingRows } = await supabase
    .from('page_access')
    .select('page_slug, role')
    .in('page_slug', uniqueSlugs)
    .in('role', roles)

  const existing = new Set(
    (existingRows ?? []).map((row: { page_slug: string; role: UserRole }) => `${row.page_slug}:${row.role}`),
  )

  const inserts: Array<{ page_slug: string; role: UserRole; is_enabled: boolean }> = []

  for (const slug of uniqueSlugs) {
    if (!existing.has(`${slug}:senior_web_producer`)) {
      inserts.push({ page_slug: slug, role: 'senior_web_producer', is_enabled: true })
    }

    if (!existing.has(`${slug}:producer`)) {
      inserts.push({
        page_slug: slug,
        role: 'producer',
        is_enabled: ALWAYS_ENABLED_SLUGS.has(slug),
      })
    }

    if (!existing.has(`${slug}:wog_editor`)) {
      inserts.push({
        page_slug: slug,
        role: 'wog_editor',
        is_enabled: WOG_EDITOR_ALLOWED_SLUGS.includes(slug),
      })
    }
  }

  if (inserts.length > 0) {
    await supabase.from('page_access').insert(inserts)
  }
}
