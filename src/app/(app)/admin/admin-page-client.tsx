'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, NON_ADMIN_ROLES, ROLES, formatRoleName } from '@/lib/nav-config'
import { ensurePageAccessRows, getUserRole } from '@/lib/permissions'
import type { PageAccess, Profile, UserPageOverride, UserRole } from '@/lib/types/database'

type ActiveTab = 'team' | 'access'
type AccessView = 'matrix' | 'member'
type PageGroup = {
  id: string
  label: string
  slugs: string[]
}

function roleBadgeClass(role: UserRole) {
  if (role === 'admin') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (role === 'senior_web_producer') return 'border-violet-500/20 bg-violet-500/15 text-violet-400'
  return 'border-blue-500/20 bg-blue-500/15 text-blue-400'
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7 3v6c0 4.97-3.05 8.79-7 9.99C8.05 20.79 5 16.97 5 12V6l7-3z"
      />
    </svg>
  )
}

function getRoleDefault(
  pageAccessMap: Map<string, boolean>,
  pageSlug: string,
  role: UserRole,
  adminOnly = false,
) {
  if (role === 'admin') return true
  if (adminOnly) return false

  const mapValue = pageAccessMap.get(`${pageSlug}:${role}`)
  if (mapValue !== undefined) return mapValue

  return role === 'senior_web_producer'
}

const NON_ADMIN_PAGES = NAV_ITEMS.filter((item) => !item.adminOnly)
const PAGE_GROUPS: PageGroup[] = [
  {
    id: 'core',
    label: 'Core',
    slugs: ['dashboard', 'my-queue', 'ad-weeks', 'calendar'],
  },
  {
    id: 'production-tools',
    label: 'Production Tools',
    slugs: ['editor', 'templates', 'carousels', 'upload'],
  },
  {
    id: 'analytics-performance',
    label: 'Analytics & Performance',
    slugs: ['analytics-performance', 'analytics-speed', 'aor-settings'],
  },
  {
    id: 'resources-admin',
    label: 'Resources & Admin',
    slugs: ['sops', 'requests', 'settings', 'profile'],
  },
]

function getUserFullName(user: Profile) {
  return user.full_name?.trim() || user.email
}

function getUserFirstName(user: Profile) {
  const fullName = user.full_name?.trim()
  if (!fullName) {
    return user.email.split('@')[0] || 'User'
  }
  return fullName.split(/\s+/)[0] || fullName
}

function getUserInitials(user: Profile) {
  const fullName = user.full_name?.trim()
  if (!fullName) {
    return (user.email.slice(0, 2) || 'U').toUpperCase()
  }

  const parts = fullName.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function AdminPageClient() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('team')
  const [accessView, setAccessView] = useState<AccessView>('matrix')
  const [currentUserId, setCurrentUserId] = useState('')

  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [pageAccessRows, setPageAccessRows] = useState<PageAccess[]>([])
  const [overrideRows, setOverrideRows] = useState<UserPageOverride[]>([])

  const [roleDefaultsOpen, setRoleDefaultsOpen] = useState(false)
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null)

  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null)
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 2200)
  }, [])

  const nonAdminUsers = useMemo(
    () => teamMembers.filter((member) => member.role !== 'admin'),
    [teamMembers],
  )

  const pageAccessMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of pageAccessRows) {
      map.set(`${row.page_slug}:${row.role}`, row.is_enabled)
    }
    return map
  }, [pageAccessRows])

  const overrideMap = useMemo(() => {
    const map = new Map<string, UserPageOverride>()
    for (const row of overrideRows) {
      map.set(`${row.user_id}:${row.page_slug}`, row)
    }
    return map
  }, [overrideRows])

  const groupedPages = useMemo(() => {
    const pageBySlug = new Map(NON_ADMIN_PAGES.map((page) => [page.slug, page]))
    const grouped = PAGE_GROUPS.map((group) => {
      const pages = group.slugs
        .map((slug) => pageBySlug.get(slug))
        .filter((page): page is (typeof NON_ADMIN_PAGES)[number] => Boolean(page))

      return {
        id: group.id,
        label: group.label,
        pages,
      }
    }).filter((group) => group.pages.length > 0)

    const groupedSlugs = new Set(grouped.flatMap((group) => group.pages.map((page) => page.slug)))
    const uncategorized = NON_ADMIN_PAGES.filter((page) => !groupedSlugs.has(page.slug))
    if (uncategorized.length > 0) {
      grouped.push({ id: 'other', label: 'Other', pages: uncategorized })
    }

    return grouped
  }, [])

  const getAccessSnapshot = useCallback(
    (user: Profile, pageSlug: string) => {
      const roleDefault = getRoleDefault(pageAccessMap, pageSlug, user.role)
      const override = overrideMap.get(`${user.id}:${pageSlug}`)
      const effective = override ? override.is_enabled : roleDefault
      const hasOverride = Boolean(override && override.is_enabled !== roleDefault)

      return {
        roleDefault,
        effective,
        hasOverride,
        isGrantOverride: hasOverride && effective,
        isRevokeOverride: hasOverride && !effective,
      }
    },
    [overrideMap, pageAccessMap],
  )

  const userStats = useMemo(() => {
    const stats = new Map<string, { granted: number; total: number; overrides: number }>()
    for (const user of nonAdminUsers) {
      let granted = 0
      let overrides = 0

      for (const page of NON_ADMIN_PAGES) {
        const snapshot = getAccessSnapshot(user, page.slug)
        if (snapshot.effective) granted += 1
        if (snapshot.hasOverride) overrides += 1
      }

      stats.set(user.id, { granted, total: NON_ADMIN_PAGES.length, overrides })
    }
    return stats
  }, [getAccessSnapshot, nonAdminUsers])

  const loadAdminData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/login')
      return
    }

    setCurrentUserId(user.id)

    const role = await getUserRole(supabase)
    if (role !== 'admin') {
      router.replace('/dashboard')
      return
    }

    await ensurePageAccessRows(
      supabase,
      NAV_ITEMS.map((item) => item.slug),
    )

    const [teamRes, defaultsRes, overridesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase
        .from('page_access')
        .select('*')
        .in('role', NON_ADMIN_ROLES.map((entry) => entry.value)),
      supabase.from('user_page_overrides').select('*'),
    ])

    setTeamMembers((teamRes.data ?? []) as Profile[])
    setPageAccessRows((defaultsRes.data ?? []) as PageAccess[])
    setOverrideRows((overridesRes.data ?? []) as UserPageOverride[])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  useEffect(() => {
    if (nonAdminUsers.length === 0) {
      setFocusedUserId(null)
      return
    }

    if (!focusedUserId) {
      setFocusedUserId(nonAdminUsers[0].id)
      return
    }

    if (!nonAdminUsers.some((user) => user.id === focusedUserId)) {
      setFocusedUserId(nonAdminUsers[0].id)
    }
  }, [focusedUserId, nonAdminUsers])

  async function updateTeamRole(userId: string, nextRole: UserRole) {
    const member = teamMembers.find((item) => item.id === userId)
    if (!member) return

    const confirmed = window.confirm(
      `Change ${member.full_name || member.email} to ${formatRoleName(nextRole)}?`,
    )
    if (!confirmed) return

    setSavingRoleUserId(userId)

    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId)

    if (!error) {
      setTeamMembers((prev) =>
        prev.map((item) => (item.id === userId ? { ...item, role: nextRole } : item)),
      )
      showToast('Role updated')
    }

    setSavingRoleUserId(null)
  }

  async function resetUserOverrides(userId: string) {
    const member = teamMembers.find((item) => item.id === userId)
    if (!member) return

    const confirmed = window.confirm(`Reset all overrides for ${member.full_name || member.email}?`)
    if (!confirmed) return

    setSavingCellKey(`reset:${userId}`)

    const { error } = await supabase.from('user_page_overrides').delete().eq('user_id', userId)

    if (!error) {
      setOverrideRows((prev) => prev.filter((row) => row.user_id !== userId))
      showToast('User access reset to defaults')
    }

    setSavingCellKey(null)
  }

  async function saveRoleDefault(pageSlug: string, role: UserRole, nextEnabled: boolean) {
    if (role === 'admin') return

    const navItem = NAV_ITEMS.find((item) => item.slug === pageSlug)
    if (!navItem || navItem.adminOnly) return

    const key = `default:${pageSlug}:${role}`
    setSavingCellKey(key)

    const { error } = await supabase
      .from('page_access')
      .upsert(
        {
          page_slug: pageSlug,
          role,
          is_enabled: nextEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_slug,role' },
      )

    if (!error) {
      setPageAccessRows((prev) => {
        const index = prev.findIndex((row) => row.page_slug === pageSlug && row.role === role)
        if (index === -1) {
          return [
            ...prev,
            {
              id: `new-${pageSlug}-${role}`,
              page_slug: pageSlug,
              role,
              is_enabled: nextEnabled,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        }

        return prev.map((row, rowIndex) =>
          rowIndex === index
            ? { ...row, is_enabled: nextEnabled, updated_at: new Date().toISOString() }
            : row,
        )
      })
      showToast('Role default saved')
    }

    setSavingCellKey(null)
  }

  async function saveUserAccess(user: Profile, pageSlug: string, nextEnabled: boolean) {
    const navItem = NAV_ITEMS.find((item) => item.slug === pageSlug)
    if (!navItem || navItem.adminOnly) return

    const key = `user:${user.id}:${pageSlug}`
    setSavingCellKey(key)

    const roleDefault = getRoleDefault(pageAccessMap, pageSlug, user.role, false)
    const existing = overrideMap.get(`${user.id}:${pageSlug}`)

    if (nextEnabled === roleDefault) {
      if (existing) {
        const { error } = await supabase
          .from('user_page_overrides')
          .delete()
          .eq('id', existing.id)

        if (!error) {
          setOverrideRows((prev) => prev.filter((row) => row.id !== existing.id))
          showToast('Access reset to role default')
        }
      }

      setSavingCellKey(null)
      return
    }

    const { data, error } = await supabase
      .from('user_page_overrides')
      .upsert(
        {
          user_id: user.id,
          page_slug: pageSlug,
          is_enabled: nextEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,page_slug' },
      )
      .select('*')
      .single()

    if (!error && data) {
      const row = data as UserPageOverride
      setOverrideRows((prev) => {
        const index = prev.findIndex(
          (item) => item.user_id === user.id && item.page_slug === pageSlug,
        )
        if (index === -1) return [...prev, row]
        return prev.map((item, itemIndex) => (itemIndex === index ? row : item))
      })
      showToast('Access updated')
    }

    setSavingCellKey(null)
  }

  const tabClass = (tab: ActiveTab) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      activeTab === tab ? 'bg-brand-700 text-white' : 'text-brand-300 hover:bg-brand-800 hover:text-white'
    }`
  const accessViewClass = (view: AccessView) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150 [transition-timing-function:ease] ${
      accessView === view
        ? 'bg-brand-700 text-white'
        : 'text-brand-300 hover:bg-brand-800/80 hover:text-white'
    }`
  const selectedUser = nonAdminUsers.find((user) => user.id === focusedUserId) ?? nonAdminUsers[0] ?? null
  const matrixGridColumns = useMemo(
    () => ({ gridTemplateColumns: `200px repeat(${nonAdminUsers.length}, minmax(0, 1fr))` }),
    [nonAdminUsers.length],
  )

  if (loading) {
    return (
      <div className="max-w-6xl">
        <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center text-brand-400">
          Loading admin settings...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 shadow-lg">
          {toastMessage}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-1 text-brand-400">Manage team roles and page access.</p>
      </div>

      <div className="inline-flex rounded-xl border border-brand-800 bg-brand-900 p-1">
        <button type="button" onClick={() => setActiveTab('team')} className={tabClass('team')}>
          Team Members
        </button>
        <button type="button" onClick={() => setActiveTab('access')} className={tabClass('access')}>
          Access Control
        </button>
      </div>

      {activeTab === 'team' && (
        <section className="rounded-2xl border border-brand-800 bg-brand-900">
          <div className="border-b border-brand-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {teamMembers.map((member) => {
                  const isSelf = member.id === currentUserId
                  const isSaving = savingRoleUserId === member.id

                  return (
                    <tr key={member.id} className="hover:bg-brand-800/30">
                      <td className="px-4 py-3 text-white">{member.full_name}</td>
                      <td className="px-4 py-3 text-brand-300">{member.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${roleBadgeClass(member.role)}`}
                          >
                            {formatRoleName(member.role)}
                          </span>
                          <select
                            value={member.role}
                            disabled={isSelf || isSaving}
                            onChange={(event) => void updateTeamRole(member.id, event.target.value as UserRole)}
                            className="rounded-lg border border-brand-700 bg-brand-900/70 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ROLES.map((role) => (
                              <option key={role.value} value={role.value}>
                                {formatRoleName(role.value)}
                              </option>
                            ))}
                          </select>
                          {member.role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setFocusedUserId(member.id)
                                setActiveTab('access')
                              }}
                              className="rounded-md border border-brand-700 px-2 py-1 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
                            >
                              Manage Access
                            </button>
                          )}
                          {isSelf && <span className="text-xs text-brand-500">You</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'access' && (
        <section className="rounded-2xl border border-brand-800 bg-brand-900">
          <div className="border-b border-brand-800 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldIcon className="h-4 w-4 text-slate-300" />
                  <h2 className="text-lg font-semibold text-white">Access Control</h2>
                </div>
                <p className="mt-1 text-sm text-brand-400">
                  Manage page visibility for team members. Admins always have full access.
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-brand-700 bg-brand-900/70 p-1">
                <button type="button" onClick={() => setAccessView('matrix')} className={accessViewClass('matrix')}>
                  Matrix
                </button>
                <button type="button" onClick={() => setAccessView('member')} className={accessViewClass('member')}>
                  By Member
                </button>
              </div>
            </div>
          </div>

          {nonAdminUsers.length === 0 ? (
            <div className="px-6 py-10 text-sm text-brand-400">No non-admin team members found.</div>
          ) : (
            <div className="px-6 py-5">
              {accessView === 'matrix' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-400/5 bg-slate-900/60 px-3 py-2 text-xs text-slate-300/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400/70">Legend</span>
                    <span className="inline-flex items-center gap-1"><span className="text-emerald-400">✓</span> Granted</span>
                    <span className="inline-flex items-center gap-1"><span className="text-slate-400/40">·</span> Denied</span>
                    <span className="inline-flex items-center gap-1"><span className="text-slate-200/90">◆</span> Override</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-1 rounded bg-emerald-400/60" />
                      Green left edge = granted override
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-1 rounded bg-red-400/60" />
                      Red left edge = denied override
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-brand-800/70 bg-slate-950/20">
                    <div className="grid border-b border-brand-800/70" style={matrixGridColumns}>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-300/70">
                        Page
                      </div>
                      {nonAdminUsers.map((user) => {
                        const stats = userStats.get(user.id)
                        const isResetting = savingCellKey === `reset:${user.id}`

                        return (
                          <div key={user.id} className="border-l border-brand-800/60 px-3 py-3 text-left">
                            <div className="flex items-start gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-500/30 bg-slate-800/70 text-[11px] font-semibold text-slate-100">
                                {getUserInitials(user)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{getUserFirstName(user)}</p>
                                <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(user.role)}`}>
                                  {formatRoleName(user.role)}
                                </span>
                                <p className="mt-1 text-[11px] font-mono text-emerald-300/90">
                                  {stats?.granted ?? 0}/{stats?.total ?? NON_ADMIN_PAGES.length}
                                </p>
                                {stats && stats.overrides > 0 && (
                                  <p className="mt-0.5 text-[11px] text-violet-300/85">{stats.overrides} overrides</p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void resetUserOverrides(user.id)}
                                  disabled={isResetting}
                                  className="mt-1 text-[11px] text-slate-400 transition-colors duration-150 [transition-timing-function:ease] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Reset to defaults
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {groupedPages.map((group) => (
                      <Fragment key={group.id}>
                        <div className="grid border-t border-brand-800/60 bg-slate-900/40" style={matrixGridColumns}>
                          <div
                            className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400/70"
                            style={{ gridColumn: '1 / -1' }}
                          >
                            {group.label}
                          </div>
                        </div>

                        {group.pages.map((page) => (
                          <div
                            key={page.slug}
                            className="group grid h-11 border-t border-brand-800/40 transition-colors duration-150 [transition-timing-function:ease] hover:bg-slate-400/[0.03]"
                            style={matrixGridColumns}
                          >
                            <div className="flex items-center px-3 text-sm text-slate-100">{page.label}</div>
                            {nonAdminUsers.map((user) => {
                              const snapshot = getAccessSnapshot(user, page.slug)
                              const isSaving = savingCellKey === `user:${user.id}:${page.slug}`

                              return (
                                <div key={user.id} className="flex items-center border-l border-brand-800/40 px-2 py-1">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => void saveUserAccess(user, page.slug, !snapshot.effective)}
                                    className={`flex h-9 w-full items-center justify-center border-l-2 text-xs transition-all duration-150 [transition-timing-function:ease] ${
                                      snapshot.isGrantOverride
                                        ? 'border-emerald-400/50 bg-emerald-400/10'
                                        : snapshot.isRevokeOverride
                                          ? 'border-red-400/40 bg-red-500/5'
                                          : snapshot.effective
                                            ? 'border-transparent bg-emerald-400/5'
                                            : 'border-transparent bg-transparent'
                                    } ${
                                      isSaving ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-300/10'
                                    }`}
                                    aria-label={`Set ${page.label} access for ${getUserFullName(user)}`}
                                  >
                                    {snapshot.effective ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-sm leading-none text-emerald-400">✓</span>
                                        {snapshot.hasOverride && (
                                          <span className="text-[9px] leading-none text-slate-200/85">◆</span>
                                        )}
                                      </span>
                                    ) : snapshot.hasOverride ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-sm leading-none text-red-500/50">×</span>
                                        <span className="text-[9px] leading-none text-slate-200/85">◆</span>
                                      </span>
                                    ) : (
                                      <span className="text-base leading-none text-slate-400/25">·</span>
                                    )}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-xl border border-brand-800/60 bg-slate-950/30 p-2">
                    <div className="space-y-2">
                      {nonAdminUsers.map((user) => {
                        const stats = userStats.get(user.id)
                        const active = selectedUser?.id === user.id
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setFocusedUserId(user.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-150 [transition-timing-function:ease] ${
                              active
                                ? 'border-blue-400/60 bg-blue-500/10'
                                : 'border-brand-800/70 bg-brand-900/50 hover:border-brand-700 hover:bg-brand-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-500/30 bg-slate-800/70 text-[11px] font-semibold text-slate-100">
                                {getUserInitials(user)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{getUserFirstName(user)}</p>
                                <p className="text-[11px] font-mono text-emerald-300/85">
                                  {stats?.granted ?? 0} of {stats?.total ?? NON_ADMIN_PAGES.length} pages
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-brand-800/60 bg-slate-950/20">
                    {selectedUser ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-800/70 px-4 py-4">
                          <div>
                            <h3 className="text-base font-semibold text-white">{getUserFullName(selectedUser)}</h3>
                            <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(selectedUser.role)}`}>
                              {formatRoleName(selectedUser.role)}
                            </span>
                            <p className="mt-2 text-xs font-mono text-emerald-300/90">
                              {userStats.get(selectedUser.id)?.granted ?? 0}/{NON_ADMIN_PAGES.length} pages granted
                            </p>
                            {(userStats.get(selectedUser.id)?.overrides ?? 0) > 0 && (
                              <p className="text-xs text-violet-300/85">
                                {userStats.get(selectedUser.id)?.overrides} overrides
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void resetUserOverrides(selectedUser.id)}
                            disabled={savingCellKey === `reset:${selectedUser.id}`}
                            className="rounded-md border border-brand-700 px-2.5 py-1.5 text-xs text-brand-300 transition-colors duration-150 [transition-timing-function:ease] hover:border-brand-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reset to role defaults
                          </button>
                        </div>

                        <div className="space-y-4 p-4">
                          {groupedPages.map((group) => (
                            <div key={group.id} className="overflow-hidden rounded-lg border border-brand-800/60">
                              <div className="border-b border-brand-800/60 bg-slate-900/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400/70">
                                {group.label}
                              </div>
                              {group.pages.map((page) => {
                                const snapshot = getAccessSnapshot(selectedUser, page.slug)
                                const isSaving = savingCellKey === `user:${selectedUser.id}:${page.slug}`

                                return (
                                  <div
                                    key={page.slug}
                                    className="flex h-11 items-center justify-between border-t border-brand-800/40 px-3 transition-colors duration-150 [transition-timing-function:ease] hover:bg-slate-400/[0.03]"
                                  >
                                    <span className="text-sm text-slate-100">{page.label}</span>
                                    <div className="flex items-center gap-2">
                                      {snapshot.hasOverride && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-violet-300/85">
                                          <span className="text-[9px]">◆</span>
                                          override
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => void saveUserAccess(selectedUser, page.slug, !snapshot.effective)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full px-1 transition-all duration-150 [transition-timing-function:ease] ${
                                          snapshot.effective ? 'bg-emerald-500/40' : 'bg-brand-700'
                                        } ${isSaving ? 'cursor-not-allowed opacity-60' : ''}`}
                                        aria-label={`Set ${page.label} access for ${getUserFullName(selectedUser)}`}
                                      >
                                        <span
                                          className={`h-4 w-4 rounded-full bg-white transition-transform duration-150 [transition-timing-function:ease] ${
                                            snapshot.effective ? 'translate-x-5' : 'translate-x-0'
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-8 text-sm text-brand-400">Select a member to view access.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRoleDefaultsOpen(true)}
                  className="rounded-lg border border-brand-700 px-3 py-2 text-sm text-brand-200 transition-colors duration-150 [transition-timing-function:ease] hover:border-brand-600 hover:text-white"
                >
                  Edit Role Defaults
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {roleDefaultsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-brand-700 bg-brand-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Role Defaults</h3>
                <p className="mt-1 text-sm text-brand-400">
                  Changes here affect all users of that role unless they have a personal override.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoleDefaultsOpen(false)}
                className="rounded-md px-2 py-1 text-brand-300 hover:bg-brand-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-800 text-brand-400">
                    <th className="sticky left-0 z-20 bg-brand-900 px-4 py-3 text-left font-medium">Page</th>
                    {NON_ADMIN_ROLES.map((role) => (
                      <th key={role.value} className="px-4 py-3 text-left font-medium">
                        {formatRoleName(role.value)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-800/50">
                  {NAV_ITEMS.map((page) => (
                    <tr key={page.slug} className="hover:bg-brand-800/20">
                      <td className="sticky left-0 z-10 bg-brand-900 px-4 py-3 text-white">
                        <div className="flex items-center gap-2">
                          <span>{page.label}</span>
                          {page.adminOnly && (
                            <span className="rounded-full border border-brand-700 px-2 py-0.5 text-[11px] text-brand-400">
                              Admin only
                            </span>
                          )}
                        </div>
                      </td>
                      {NON_ADMIN_ROLES.map((role) => {
                        const defaultEnabled = getRoleDefault(pageAccessMap, page.slug, role.value, Boolean(page.adminOnly))
                        const key = `default:${page.slug}:${role.value}`
                        const isSaving = savingCellKey === key

                        return (
                          <td key={role.value} className="px-4 py-3">
                            <button
                              type="button"
                              disabled={Boolean(page.adminOnly) || isSaving}
                              onClick={() => void saveRoleDefault(page.slug, role.value, !defaultEnabled)}
                              className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                                defaultEnabled ? 'bg-emerald-500/40' : 'bg-brand-700'
                              } ${(Boolean(page.adminOnly) || isSaving) ? 'cursor-not-allowed opacity-60' : ''}`}
                              aria-label={`Set ${formatRoleName(role.value)} default for ${page.label}`}
                            >
                              <span
                                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                  defaultEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
