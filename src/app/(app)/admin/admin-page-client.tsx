'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, NON_ADMIN_ROLES, ROLES, formatRoleName } from '@/lib/nav-config'
import { ensurePageAccessRows, getUserRole } from '@/lib/permissions'
import type { PageAccess, Profile, UserPageOverride, UserRole } from '@/lib/types/database'

type ActiveTab = 'team' | 'access'

function roleBadgeClass(role: UserRole) {
  if (role === 'admin') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (role === 'senior_web_producer') return 'border-violet-500/40 bg-violet-500/15 text-violet-200'
  return 'border-blue-500/40 bg-blue-500/15 text-blue-200'
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

export default function AdminPageClient() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('team')
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
    if (!focusedUserId) return
    if (!nonAdminUsers.some((user) => user.id === focusedUserId)) {
      setFocusedUserId(null)
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
          <div className="flex items-center justify-between gap-3 border-b border-brand-800 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Access Control</h2>
              <p className="mt-1 text-sm text-brand-400">
                Admins always have full access. Manage access for team members below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRoleDefaultsOpen(true)}
              className="rounded-lg border border-brand-700 px-3 py-2 text-sm text-brand-200 transition-colors hover:border-brand-600 hover:text-white"
            >
              Edit Role Defaults
            </button>
          </div>

          {nonAdminUsers.length === 0 ? (
            <div className="px-6 py-10 text-sm text-brand-400">No non-admin team members found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-800 text-brand-400">
                    <th className="sticky left-0 z-30 min-w-[220px] bg-brand-900 px-4 py-3 text-left font-medium">
                      Page
                    </th>
                    {nonAdminUsers.map((user) => {
                      const columnFocused = focusedUserId === user.id

                      return (
                        <th
                          key={user.id}
                          className={`min-w-[220px] px-4 py-3 text-left font-medium ${
                            columnFocused ? 'bg-brand-800/40' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-white text-sm font-semibold">{user.full_name}</p>
                              <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(user.role)}`}>
                                {formatRoleName(user.role)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void resetUserOverrides(user.id)}
                              disabled={savingCellKey === `reset:${user.id}`}
                              className="rounded-md border border-brand-700 px-2 py-1 text-xs text-brand-300 hover:border-brand-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reset to defaults
                            </button>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-800/50">
                  {NON_ADMIN_PAGES.map((page) => (
                    <tr key={page.slug} className="hover:bg-brand-800/20">
                      <td className="sticky left-0 z-20 bg-brand-900 px-4 py-3 text-white">{page.label}</td>
                      {nonAdminUsers.map((user) => {
                        const roleDefault = getRoleDefault(pageAccessMap, page.slug, user.role)
                        const override = overrideMap.get(`${user.id}:${page.slug}`)
                        const effective = override ? override.is_enabled : roleDefault
                        const hasOverride = Boolean(override && override.is_enabled !== roleDefault)
                        const cellKey = `user:${user.id}:${page.slug}`
                        const isSaving = savingCellKey === cellKey

                        return (
                          <td key={user.id} className={`px-4 py-3 ${focusedUserId === user.id ? 'bg-brand-800/20' : ''}`}>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void saveUserAccess(user, page.slug, !effective)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                                  effective ? 'bg-emerald-500/40' : 'bg-brand-700'
                                } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
                                aria-label={`Set ${page.label} access for ${user.full_name}`}
                              >
                                <span
                                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                                    effective ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              {hasOverride && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full bg-amber-300"
                                  title={`Overridden from role default (${roleDefault ? 'Enabled' : 'Disabled'})`}
                                />
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
