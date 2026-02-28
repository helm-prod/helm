import type { SupabaseClient } from '@supabase/supabase-js'
import { NAV_ITEMS } from '@/lib/nav-config'
import type { UserRole } from '@/lib/types/database'

type PageAccessRow = {
  page_slug: string
  role: UserRole
  is_enabled: boolean
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

  return data?.role === 'admin' ? 'admin' : 'producer'
}

export async function getAccessibleSlugs(
  supabase: SupabaseClient,
  role: UserRole,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('page_access')
    .select('page_slug, role, is_enabled')
    .eq('role', role)

  const rowMap = new Map<string, boolean>()
  for (const row of (data ?? []) as PageAccessRow[]) {
    rowMap.set(row.page_slug, row.is_enabled)
  }

  const slugs = new Set<string>()

  for (const item of NAV_ITEMS) {
    if (rowMap.has(item.slug)) {
      if (rowMap.get(item.slug)) {
        slugs.add(item.slug)
      }
      continue
    }

    if (role === 'admin') {
      slugs.add(item.slug)
    }
  }

  return slugs
}

export async function checkPageAccess(
  supabase: SupabaseClient,
  pageSlug: string,
): Promise<boolean> {
  const role = await getUserRole(supabase)
  const item = NAV_ITEMS.find((navItem) => navItem.slug === pageSlug)

  if (!item) {
    return false
  }

  if (item.adminOnly && role !== 'admin') {
    return false
  }

  const accessibleSlugs = await getAccessibleSlugs(supabase, role)
  return accessibleSlugs.has(pageSlug)
}

export async function ensurePageAccessRows(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<void> {
  const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)))

  if (uniqueSlugs.length === 0) {
    return
  }

  const { data: existingRows } = await supabase
    .from('page_access')
    .select('page_slug, role')
    .in('page_slug', uniqueSlugs)

  const existing = new Set(
    (existingRows ?? []).map((row: { page_slug: string; role: UserRole }) => `${row.page_slug}:${row.role}`),
  )

  const inserts: Array<{ page_slug: string; role: UserRole; is_enabled: boolean }> = []

  for (const slug of uniqueSlugs) {
    if (!existing.has(`${slug}:admin`)) {
      inserts.push({ page_slug: slug, role: 'admin', is_enabled: true })
    }

    if (!existing.has(`${slug}:producer`)) {
      inserts.push({ page_slug: slug, role: 'producer', is_enabled: false })
    }
  }

  if (inserts.length > 0) {
    await supabase.from('page_access').insert(inserts)
  }
}
