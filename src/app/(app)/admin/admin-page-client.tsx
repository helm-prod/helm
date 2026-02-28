'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS } from '@/lib/nav-config'
import { ensurePageAccessRows, getUserRole } from '@/lib/permissions'
import type { PageAccess, Profile, UserRole } from '@/lib/types/database'

type ActiveTab = 'permissions' | 'team'

export default function AdminPageClient() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('permissions')
  const [pageAccessRows, setPageAccessRows] = useState<PageAccess[]>([])
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 2200)
  }, [])

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
      supabase.from('page_access').select('*').order('page_slug', { ascending: true }),
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
    ])

    setPageAccessRows((pageAccessRes.data ?? []) as PageAccess[])
    setTeamMembers((profilesRes.data ?? []) as Profile[])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  const producerAccessMap = useMemo(() => {
    const map = new Map<string, boolean>()

    for (const row of pageAccessRows) {
      if (row.role === 'producer') {
        map.set(row.page_slug, row.is_enabled)
      }
    }

    return map
  }, [pageAccessRows])

  async function toggleProducerPageAccess(slug: string, isEnabled: boolean) {
    setSavingSlug(slug)

    const { error } = await supabase
      .from('page_access')
      .upsert(
        {
          page_slug: slug,
          role: 'producer',
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_slug,role' },
      )

    if (!error) {
      setPageAccessRows((prev) => {
        const existingIndex = prev.findIndex(
          (row) => row.page_slug === slug && row.role === 'producer',
        )

        if (existingIndex === -1) {
          return [
            ...prev,
            {
              id: `new-${slug}`,
              page_slug: slug,
              role: 'producer',
              is_enabled: isEnabled,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        }

        return prev.map((row, index) =>
          index === existingIndex
            ? { ...row, is_enabled: isEnabled, updated_at: new Date().toISOString() }
            : row,
        )
      })
      showToast('Permission saved')
    }

    setSavingSlug(null)
  }

  async function updateTeamRole(userId: string, nextRole: UserRole) {
    const member = teamMembers.find((teamMember) => teamMember.id === userId)
    if (!member) return

    const confirmed = window.confirm(
      `Change ${member.full_name || member.email} to ${nextRole}?`,
    )

    if (!confirmed) {
      return
    }

    setSavingUserId(userId)

    const { error } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', userId)

    if (!error) {
      setTeamMembers((prev) =>
        prev.map((teamMember) =>
          teamMember.id === userId ? { ...teamMember, role: nextRole } : teamMember,
        ),
      )
      showToast('Role updated')
    }

    setSavingUserId(null)
  }

  const tabClass = (tab: ActiveTab) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'bg-brand-700 text-white'
        : 'text-brand-300 hover:bg-brand-800 hover:text-white'
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
        <p className="mt-1 text-brand-400">
          Configure page access and manage team roles.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-brand-800 bg-brand-900 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('permissions')}
          className={tabClass('permissions')}
        >
          Page Permissions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('team')}
          className={tabClass('team')}
        >
          Team Members
        </button>
      </div>

      {activeTab === 'permissions' && (
        <section className="rounded-2xl border border-brand-800 bg-brand-900">
          <div className="border-b border-brand-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Page Permissions</h2>
            <p className="mt-1 text-sm text-brand-400">
              Admin access is always enabled. Toggle producer access per page.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="px-4 py-3 text-left font-medium">Page Name</th>
                  <th className="px-4 py-3 text-left font-medium">Admin</th>
                  <th className="px-4 py-3 text-left font-medium">Producer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {NAV_ITEMS.map((item) => {
                  const producerEnabled = producerAccessMap.get(item.slug) ?? false
                  const isSaving = savingSlug === item.slug

                  return (
                    <tr key={item.slug} className="hover:bg-brand-800/30">
                      <td className="px-4 py-3 text-white">{item.label}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-6 w-11 items-center rounded-full bg-emerald-500/40 px-1 opacity-70"
                          aria-label="Admin always enabled"
                        >
                          <span className="h-4 w-4 rounded-full bg-white" />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void toggleProducerPageAccess(item.slug, !producerEnabled)}
                          className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                            producerEnabled
                              ? 'bg-emerald-500/40'
                              : 'bg-brand-700'
                          } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
                          aria-label={`Toggle producer access for ${item.label}`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-white transition-transform ${
                              producerEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                              member.role === 'admin'
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                : 'border-blue-500/40 bg-blue-500/15 text-blue-200'
                            }`}
                          >
                            {member.role}
                          </span>
                          <select
                            value={member.role}
                            disabled={isSelf || isSaving}
                            onChange={(event) =>
                              void updateTeamRole(member.id, event.target.value as UserRole)
                            }
                            className="rounded-lg border border-brand-700 bg-brand-900/70 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="admin">admin</option>
                            <option value="producer">producer</option>
                          </select>
                          {isSelf && (
                            <span className="text-xs text-brand-500">You</span>
                          )}
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
    </div>
  )
}
