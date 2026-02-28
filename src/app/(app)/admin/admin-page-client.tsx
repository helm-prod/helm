'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, NON_ADMIN_ROLES, ROLES } from '@/lib/nav-config'
import { ensurePageAccessRows, getUserRole } from '@/lib/permissions'
import type { PageAccess, Profile, UserPageOverride, UserRole } from '@/lib/types/database'

type ActiveTab = 'permissions' | 'team' | 'overrides'

type OverrideChoice = 'default' | 'grant' | 'revoke'

function getRoleFallback(role: UserRole) {
  if (role === 'senior_web_producer') return true
  return false
}

function roleBadgeClass(role: UserRole) {
  if (role === 'admin') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (role === 'senior_web_producer') return 'border-violet-500/40 bg-violet-500/15 text-violet-200'
  return 'border-blue-500/40 bg-blue-500/15 text-blue-200'
}

export default function AdminPageClient() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('permissions')
  const [currentUserId, setCurrentUserId] = useState('')

  const [pageAccessRows, setPageAccessRows] = useState<PageAccess[]>([])
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])

  const [selectedOverrideUserId, setSelectedOverrideUserId] = useState('')
  const [selectedOverrides, setSelectedOverrides] = useState<UserPageOverride[]>([])

  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 2200)
  }, [])

  const loadOverrides = useCallback(
    async (userId: string) => {
      if (!userId) {
        setSelectedOverrides([])
        return
      }

      const { data } = await supabase
        .from('user_page_overrides')
        .select('*')
        .eq('user_id', userId)

      setSelectedOverrides((data ?? []) as UserPageOverride[])
    },
    [supabase],
  )

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

    const slugs = NAV_ITEMS.map((item) => item.slug)
    await ensurePageAccessRows(supabase, slugs)

    const [pageAccessRes, profilesRes] = await Promise.all([
      supabase
        .from('page_access')
        .select('*')
        .in('role', NON_ADMIN_ROLES.map((entry) => entry.value)),
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
    ])

    const pageAccess = (pageAccessRes.data ?? []) as PageAccess[]
    const team = (profilesRes.data ?? []) as Profile[]

    setPageAccessRows(pageAccess)
    setTeamMembers(team)

    const firstNonAdmin = team.find((member) => member.role !== 'admin')
    const initialUserId = firstNonAdmin?.id ?? ''
    setSelectedOverrideUserId(initialUserId)
    await loadOverrides(initialUserId)

    setLoading(false)
  }, [loadOverrides, router, supabase])

  useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  useEffect(() => {
    void loadOverrides(selectedOverrideUserId)
  }, [loadOverrides, selectedOverrideUserId])

  const nonAdminMembers = useMemo(
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

  const selectedUser = useMemo(
    () => nonAdminMembers.find((member) => member.id === selectedOverrideUserId) ?? null,
    [nonAdminMembers, selectedOverrideUserId],
  )

  const selectedOverrideMap = useMemo(() => {
    const map = new Map<string, UserPageOverride>()
    for (const row of selectedOverrides) {
      map.set(row.page_slug, row)
    }
    return map
  }, [selectedOverrides])

  const roleDefaults = useMemo(() => {
    if (!selectedUser) return new Map<string, boolean>()

    const map = new Map<string, boolean>()
    for (const item of NAV_ITEMS) {
      if (item.adminOnly) {
        map.set(item.slug, false)
        continue
      }

      const key = `${item.slug}:${selectedUser.role}`
      if (pageAccessMap.has(key)) {
        map.set(item.slug, Boolean(pageAccessMap.get(key)))
      } else {
        map.set(item.slug, getRoleFallback(selectedUser.role))
      }
    }

    return map
  }, [pageAccessMap, selectedUser])

  const summary = useMemo(() => {
    if (!selectedUser) return { roleCount: 0, effectiveCount: 0, overrideDelta: 0 }

    let roleCount = 0
    let effectiveCount = 0

    for (const item of NAV_ITEMS) {
      if (item.adminOnly) continue

      const defaultEnabled = roleDefaults.get(item.slug) ?? false
      if (defaultEnabled) roleCount += 1

      const override = selectedOverrideMap.get(item.slug)
      const finalEnabled = override ? override.is_enabled : defaultEnabled
      if (finalEnabled) effectiveCount += 1
    }

    return {
      roleCount,
      effectiveCount,
      overrideDelta: effectiveCount - roleCount,
    }
  }, [roleDefaults, selectedOverrideMap, selectedUser])

  async function toggleRoleDefault(slug: string, role: UserRole, isEnabled: boolean) {
    if (role === 'admin') return
    setSavingKey(`${slug}:${role}`)

    const { error } = await supabase
      .from('page_access')
      .upsert(
        {
          page_slug: slug,
          role,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_slug,role' },
      )

    if (!error) {
      setPageAccessRows((prev) => {
        const index = prev.findIndex((row) => row.page_slug === slug && row.role === role)
        if (index === -1) {
          return [
            ...prev,
            {
              id: `new-${slug}-${role}`,
              page_slug: slug,
              role,
              is_enabled: isEnabled,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        }

        return prev.map((row, rowIndex) =>
          rowIndex === index
            ? { ...row, is_enabled: isEnabled, updated_at: new Date().toISOString() }
            : row,
        )
      })
      showToast('Role default saved')
    }

    setSavingKey(null)
  }

  async function updateTeamRole(userId: string, nextRole: UserRole) {
    const member = teamMembers.find((teamMember) => teamMember.id === userId)
    if (!member) return

    const confirmed = window.confirm(`Change ${member.full_name || member.email} to ${nextRole}?`)
    if (!confirmed) return

    setSavingUserId(userId)

    const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', userId)

    if (!error) {
      setTeamMembers((prev) =>
        prev.map((teamMember) =>
          teamMember.id === userId ? { ...teamMember, role: nextRole } : teamMember,
        ),
      )

      if (selectedOverrideUserId === userId && nextRole === 'admin') {
        const fallback = teamMembers.find(
          (teamMember) => teamMember.id !== userId && teamMember.role !== 'admin',
        )
        setSelectedOverrideUserId(fallback?.id ?? '')
      }

      showToast('Role updated')
    }

    setSavingUserId(null)
  }

  async function updateOverride(pageSlug: string, choice: OverrideChoice) {
    if (!selectedUser) return

    const key = `${selectedUser.id}:${pageSlug}`
    setSavingKey(key)

    const existing = selectedOverrideMap.get(pageSlug)

    if (choice === 'default') {
      if (existing) {
        const { error } = await supabase
          .from('user_page_overrides')
          .delete()
          .eq('id', existing.id)

        if (!error) {
          setSelectedOverrides((prev) => prev.filter((row) => row.id !== existing.id))
          showToast('Override cleared')
        }
      }
      setSavingKey(null)
      return
    }

    const isEnabled = choice === 'grant'

    const { data, error } = await supabase
      .from('user_page_overrides')
      .upsert(
        {
          user_id: selectedUser.id,
          page_slug: pageSlug,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,page_slug' },
      )
      .select('*')
      .single()

    if (!error && data) {
      const row = data as UserPageOverride
      setSelectedOverrides((prev) => {
        const index = prev.findIndex((item) => item.page_slug === pageSlug)
        if (index === -1) return [...prev, row]
        return prev.map((item, itemIndex) => (itemIndex === index ? row : item))
      })
      showToast('Override saved')
    }

    setSavingKey(null)
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
    <div className="mx-auto max-w-6xl space-y-6">
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200 shadow-lg">
          {toastMessage}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-1 text-brand-400">Configure role defaults, team roles, and per-user overrides.</p>
      </div>

      <div className="inline-flex rounded-xl border border-brand-800 bg-brand-900 p-1">
        <button type="button" onClick={() => setActiveTab('permissions')} className={tabClass('permissions')}>
          Page Permissions
        </button>
        <button type="button" onClick={() => setActiveTab('team')} className={tabClass('team')}>
          Team Members
        </button>
        <button type="button" onClick={() => setActiveTab('overrides')} className={tabClass('overrides')}>
          User Overrides
        </button>
      </div>

      {activeTab === 'permissions' && (
        <section className="rounded-2xl border border-brand-800 bg-brand-900">
          <div className="border-b border-brand-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Page Permissions</h2>
            <p className="mt-1 text-sm text-brand-400">
              Admins always have full access. Configure default access for other roles below.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="px-4 py-3 text-left font-medium">Page Name</th>
                  {NON_ADMIN_ROLES.map((role) => (
                    <th key={role.value} className="px-4 py-3 text-left font-medium">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {NAV_ITEMS.map((item) => (
                  <tr key={item.slug} className="hover:bg-brand-800/30">
                    <td className="px-4 py-3 text-white">{item.label}</td>
                    {NON_ADMIN_ROLES.map((role) => {
                      const accessKey = `${item.slug}:${role.value}`
                      const isSaving = savingKey === accessKey
                      const defaultEnabled = pageAccessMap.get(accessKey) ?? getRoleFallback(role.value)

                      return (
                        <td key={role.value} className="px-4 py-3">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void toggleRoleDefault(item.slug, role.value, !defaultEnabled)}
                            className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                              defaultEnabled ? 'bg-emerald-500/40' : 'bg-brand-700'
                            } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
                            aria-label={`Toggle ${role.label} default for ${item.label}`}
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
        </section>
      )}

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
                  const isSaving = savingUserId === member.id

                  return (
                    <tr key={member.id} className="hover:bg-brand-800/30">
                      <td className="px-4 py-3 text-white">{member.full_name}</td>
                      <td className="px-4 py-3 text-brand-300">{member.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${roleBadgeClass(member.role)}`}
                          >
                            {ROLES.find((role) => role.value === member.role)?.label || member.role}
                          </span>
                          <select
                            value={member.role}
                            disabled={isSelf || isSaving}
                            onChange={(event) => void updateTeamRole(member.id, event.target.value as UserRole)}
                            className="rounded-lg border border-brand-700 bg-brand-900/70 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ROLES.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          {member.role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOverrideUserId(member.id)
                                setActiveTab('overrides')
                              }}
                              className="rounded-md border border-brand-700 px-2 py-1 text-xs text-brand-300 hover:border-brand-600 hover:text-white"
                            >
                              Manage Overrides
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

      {activeTab === 'overrides' && (
        <section className="rounded-2xl border border-brand-800 bg-brand-900">
          <div className="border-b border-brand-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">User Overrides</h2>
            <p className="mt-1 text-sm text-brand-400">Grant or revoke access per user. Overrides always win over role defaults.</p>
          </div>

          <div className="space-y-4 px-6 py-4">
            <div className="max-w-sm">
              <label className="mb-1 block text-xs uppercase tracking-wide text-brand-500">Team Member</label>
              <select
                value={selectedOverrideUserId}
                onChange={(event) => setSelectedOverrideUserId(event.target.value)}
                className="w-full rounded-xl border border-brand-700 bg-brand-900/70 px-3 py-2 text-sm text-white"
              >
                {nonAdminMembers.length === 0 && <option value="">No non-admin users</option>}
                {nonAdminMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({member.email})
                  </option>
                ))}
              </select>
            </div>

            {selectedUser ? (
              <>
                <div className="rounded-xl border border-brand-800 bg-brand-900/50 px-4 py-3 text-sm text-brand-300">
                  <p>
                    Role: <span className="text-white">{ROLES.find((role) => role.value === selectedUser.role)?.label || selectedUser.role}</span>
                  </p>
                  <p className="mt-1">
                    {summary.effectiveCount} pages accessible ({summary.roleCount} from role, {summary.overrideDelta} from overrides)
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-brand-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-brand-800 text-brand-400">
                        <th className="px-4 py-3 text-left font-medium">Page Name</th>
                        <th className="px-4 py-3 text-left font-medium">Role Default</th>
                        <th className="px-4 py-3 text-left font-medium">Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-800/50">
                      {NAV_ITEMS.map((item) => {
                        const defaultEnabled = roleDefaults.get(item.slug) ?? false
                        const override = selectedOverrideMap.get(item.slug)
                        const controlValue: OverrideChoice =
                          override === undefined ? 'default' : override.is_enabled ? 'grant' : 'revoke'
                        const isAdminOnly = Boolean(item.adminOnly)
                        const rowSavingKey = `${selectedUser.id}:${item.slug}`
                        const isSaving = savingKey === rowSavingKey

                        return (
                          <tr key={item.slug} className="hover:bg-brand-800/30">
                            <td className="px-4 py-3 text-white">{item.label}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  defaultEnabled
                                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                    : 'border-slate-500/40 bg-slate-500/15 text-slate-300'
                                }`}
                              >
                                {defaultEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={controlValue}
                                disabled={isSaving || isAdminOnly}
                                onChange={(event) => void updateOverride(item.slug, event.target.value as OverrideChoice)}
                                className="rounded-lg border border-brand-700 bg-brand-900/70 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="default">Use Default</option>
                                <option value="grant">Grant Access</option>
                                <option value="revoke">Revoke Access</option>
                              </select>
                              {isAdminOnly && (
                                <span className="ml-2 text-xs text-brand-500">Admins only</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-brand-800 bg-brand-900/50 px-4 py-3 text-sm text-brand-400">
                No non-admin users available for overrides.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
