'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NAV_ITEMS, ROLES, formatRoleName } from '@/lib/nav-config'
import { ensurePageAccessRows, getUserRole } from '@/lib/permissions'
import type { PageAccess, Profile, UserPageOverride, UserRole } from '@/lib/types/database'

type ActiveTab = 'team' | 'access'
type AccessView = 'matrix' | 'member'
type PageGroup = {
  id: string
  label: string
  slugs: string[]
}
type UserAuthMeta = {
  email: string | null
  last_sign_in_at: string | null
  banned_until: string | null
}
type RowNotice = {
  type: 'success' | 'error'
  message: string
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatRelativeTime(isoString: string | null | undefined) {
  if (isoString === undefined) return 'Unavailable'
  if (isoString === null) return 'Never'

  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return 'Unavailable'

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  if (absSeconds < 60) return RELATIVE_TIME_FORMATTER.format(diffSeconds, 'second')
  if (absSeconds < 60 * 60) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 60), 'minute')
  if (absSeconds < 60 * 60 * 24) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 3600), 'hour')
  if (absSeconds < 60 * 60 * 24 * 30) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 86400), 'day')
  if (absSeconds < 60 * 60 * 24 * 365) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / (86400 * 30)), 'month')
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / (86400 * 365)), 'year')
}

function isUserLocked(bannedUntil: string | null | undefined) {
  if (!bannedUntil || bannedUntil === 'none') return false
  const parsed = Date.parse(bannedUntil)
  if (Number.isNaN(parsed)) return true
  return parsed > Date.now()
}

function roleBadgeClass(role: UserRole) {
  if (role === 'admin') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (role === 'senior_web_producer') return 'border-violet-500/20 bg-violet-500/15 text-violet-400'
  if (role === 'wog_editor') return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-300'
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 7.5l2.2 2.2L11 4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5 7V5C5 3.34 5.67 2 7 2C8.33 2 9 3.34 9 5V7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 5l4.5 3.5L12.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 11.5V13h1.5l6-6-1.5-1.5-6 6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8.8 5.2l1.5 1.5 1.1-1.1a1.06 1.06 0 000-1.5l-.1-.1a1.06 1.06 0 00-1.5 0L8.8 5.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 8h5M11 8v2M13 8v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M1.5 8s2.2-3.5 6.5-3.5c1.1 0 2.1.2 3 .6M14.5 8s-.7 1.1-2 2M8 11.5c-4.3 0-6.5-3.5-6.5-3.5s.8-1.2 2.1-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
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
  const [authMetaByUserId, setAuthMetaByUserId] = useState<Record<string, UserAuthMeta>>({})

  const [focusedUserId, setFocusedUserId] = useState<string | null>(null)
  const [openActionsUserId, setOpenActionsUserId] = useState<string | null>(null)
  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<string | null>(null)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [showPasswordDraft, setShowPasswordDraft] = useState(false)
  const [passwordValidationMessage, setPasswordValidationMessage] = useState('')
  const [rowNoticeByUserId, setRowNoticeByUserId] = useState<Record<string, RowNotice>>({})

  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null)
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null)
  const [savingAccountActionKey, setSavingAccountActionKey] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const manageMenuRef = useRef<HTMLDivElement | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 2200)
  }, [])

  const showRowNotice = useCallback((userId: string, notice: RowNotice) => {
    setRowNoticeByUserId((prev) => ({ ...prev, [userId]: notice }))
    window.setTimeout(() => {
      setRowNoticeByUserId((prev) => {
        if (!prev[userId] || prev[userId].message !== notice.message) return prev
        const next = { ...prev }
        delete next[userId]
        return next
      })
    }, 3000)
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

  const getEffectiveAccess = useCallback(
    (user: Profile, pageSlug: string) => {
      const roleDefault = getRoleDefault(pageAccessMap, pageSlug, user.role)
      const override = overrideMap.get(`${user.id}:${pageSlug}`)
      return override ? override.is_enabled : roleDefault
    },
    [overrideMap, pageAccessMap],
  )

  const userStats = useMemo(() => {
    const stats = new Map<string, { granted: number; total: number }>()
    for (const user of nonAdminUsers) {
      let granted = 0

      for (const page of NON_ADMIN_PAGES) {
        if (getEffectiveAccess(user, page.slug)) granted += 1
      }

      stats.set(user.id, { granted, total: NON_ADMIN_PAGES.length })
    }
    return stats
  }, [getEffectiveAccess, nonAdminUsers])

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
      supabase.from('page_access').select('*'),
      supabase.from('user_page_overrides').select('*'),
    ])

    setTeamMembers((teamRes.data ?? []) as Profile[])
    setPageAccessRows((defaultsRes.data ?? []) as PageAccess[])
    setOverrideRows((overridesRes.data ?? []) as UserPageOverride[])

    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' })
      const payload = (await response.json()) as {
        users?: Record<string, UserAuthMeta>
        error?: string
      }

      if (!response.ok) {
        showToast(payload.error || 'Unable to load auth metadata')
      } else {
        setAuthMetaByUserId(payload.users ?? {})
      }
    } catch {
      showToast('Unable to load auth metadata')
    }

    setLoading(false)
  }, [router, showToast, supabase])

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

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!openActionsUserId) return
      const target = event.target as Node | null
      if (!manageMenuRef.current || (target && manageMenuRef.current.contains(target))) {
        return
      }
      setOpenActionsUserId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenActionsUserId(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openActionsUserId])

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

  const upsertUserAuthMeta = useCallback((userId: string, patch: Partial<UserAuthMeta>) => {
    setAuthMetaByUserId((prev) => ({
      ...prev,
      [userId]: {
        email: prev[userId]?.email ?? null,
        last_sign_in_at: prev[userId]?.last_sign_in_at ?? null,
        banned_until: prev[userId]?.banned_until ?? null,
        ...patch,
      },
    }))
  }, [])

  async function runAccountAction(
    user: Profile,
    body: {
      action: 'reset_password' | 'toggle_lock' | 'update_email' | 'set_password'
      email?: string
      banned?: boolean
      password?: string
    },
  ) {
    const actionKey = `${body.action}:${user.id}`
    setSavingAccountActionKey(actionKey)

    let payload: Record<string, unknown> = {}
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, userId: user.id }),
      })

      payload = (await response.json()) as Record<string, unknown>

      if (!response.ok) {
        showRowNotice(user.id, {
          type: 'error',
          message: String(payload.error || 'Action failed'),
        })
        return false
      }
    } catch {
      showRowNotice(user.id, {
        type: 'error',
        message: 'Request failed',
      })
      return false
    } finally {
      setSavingAccountActionKey(null)
    }

    if (body.action === 'reset_password') {
      const sentTo = String(payload.email || user.email)
      showRowNotice(user.id, {
        type: 'success',
        message: `Reset email sent to ${sentTo}`,
      })
      return true
    }

    if (body.action === 'toggle_lock') {
      upsertUserAuthMeta(user.id, {
        banned_until: (payload.banned_until as string | null | undefined) ?? null,
      })
      showRowNotice(user.id, {
        type: 'success',
        message: body.banned ? 'Account locked' : 'Account unlocked',
      })
      return true
    }

    if (body.action === 'update_email') {
      const nextEmail = String(payload.email || body.email || user.email)
      setTeamMembers((prev) =>
        prev.map((member) => (member.id === user.id ? { ...member, email: nextEmail } : member)),
      )
      upsertUserAuthMeta(user.id, {
        email: nextEmail,
        banned_until: (payload.banned_until as string | null | undefined) ?? null,
        last_sign_in_at: (payload.last_sign_in_at as string | null | undefined) ?? null,
      })
      setEditingEmailUserId(null)
      setEmailDraft('')
      showRowNotice(user.id, {
        type: 'success',
        message: `Email updated to ${nextEmail}`,
      })
      return true
    }

    if (body.action === 'set_password') {
      setEditingPasswordUserId(null)
      setPasswordDraft('')
      setShowPasswordDraft(false)
      setPasswordValidationMessage('')
      showRowNotice(user.id, {
        type: 'success',
        message: String(payload.message || 'Password updated'),
      })
      return true
    }

    return false
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
      <div className="max-w-5xl">
        <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center text-brand-400">
          Loading admin settings...
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
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

          <div className="relative overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-800 text-brand-400">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Last Login</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-800/50">
                {teamMembers.map((member) => {
                  const isSelf = member.id === currentUserId
                  const isSaving = savingRoleUserId === member.id
                  const authMeta = authMetaByUserId[member.id]
                  const isLocked = isUserLocked(authMeta?.banned_until)
                  const actionMenuOpen = openActionsUserId === member.id
                  const rowNotice = rowNoticeByUserId[member.id]
                  const isResetting = savingAccountActionKey === `reset_password:${member.id}`
                  const isLocking = savingAccountActionKey === `toggle_lock:${member.id}`
                  const isUpdatingEmail = savingAccountActionKey === `update_email:${member.id}`
                  const isSettingPassword = savingAccountActionKey === `set_password:${member.id}`

                  return (
                    <Fragment key={member.id}>
                      <tr className="hover:bg-brand-800/30">
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
                            {isSelf && <span className="text-xs text-brand-500">You</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-brand-300">{formatRelativeTime(authMeta?.last_sign_in_at)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                              isLocked
                                ? 'border-red-500/30 bg-red-500/15 text-red-300'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                            }`}
                          >
                            {isLocked && <LockIcon className="h-3 w-3" />}
                            {isLocked ? 'Locked' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div ref={actionMenuOpen ? manageMenuRef : null} className="relative inline-block">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenActionsUserId((prev) => (prev === member.id ? null : member.id))
                              }
                              className="rounded-md border border-brand-700 px-2 py-1 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
                            >
                              Manage
                            </button>

                            {actionMenuOpen && (
                              <div className="absolute bottom-full right-0 z-50 mb-1 w-44 rounded-lg border border-brand-700 bg-brand-900 p-1 shadow-xl">
                                {!isSelf && (
                                  <button
                                    type="button"
                                    disabled={isSettingPassword}
                                    onClick={() => {
                                      setOpenActionsUserId(null)
                                      setEditingEmailUserId(null)
                                      setEmailDraft('')
                                      setEditingPasswordUserId(member.id)
                                      setPasswordDraft('')
                                      setShowPasswordDraft(false)
                                      setPasswordValidationMessage('')
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-brand-200 transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <KeyIcon className="h-3.5 w-3.5" />
                                    Set Password
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={isResetting}
                                  onClick={() => {
                                    setOpenActionsUserId(null)
                                    void runAccountAction(member, {
                                      action: 'reset_password',
                                      email: member.email,
                                    })
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-brand-200 transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <MailIcon className="h-3.5 w-3.5" />
                                  Send Reset Email
                                </button>

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionsUserId(null)
                                      setEditingPasswordUserId(null)
                                      setPasswordDraft('')
                                      setShowPasswordDraft(false)
                                      setPasswordValidationMessage('')
                                      setEditingEmailUserId(member.id)
                                      setEmailDraft(member.email)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-brand-200 transition-colors hover:bg-brand-800"
                                  >
                                    <EditIcon className="h-3.5 w-3.5" />
                                    Change Email
                                  </button>
                                )}

                                {!isSelf && (
                                  <button
                                    type="button"
                                    disabled={isLocking}
                                    onClick={() => {
                                      const nextLocked = !isLocked
                                      if (nextLocked) {
                                        const confirmed = window.confirm(
                                          `Are you sure you want to lock ${getUserFullName(member)}'s account? They won't be able to sign in.`,
                                        )
                                        if (!confirmed) return
                                      }

                                      setOpenActionsUserId(null)
                                      void runAccountAction(member, {
                                        action: 'toggle_lock',
                                        banned: nextLocked,
                                      })
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 ${
                                      isLocked ? 'text-emerald-300' : 'text-red-300'
                                    }`}
                                  >
                                    <LockIcon className="h-3.5 w-3.5" />
                                    {isLocked ? 'Unlock Account' : 'Lock Account'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {editingEmailUserId === member.id && (
                        <tr className="bg-brand-900/40">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <input
                                type="email"
                                value={emailDraft}
                                onChange={(event) => setEmailDraft(event.target.value)}
                                className="w-full rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 text-sm text-white placeholder:text-brand-500 sm:max-w-sm"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isUpdatingEmail}
                                  onClick={() => {
                                    const nextEmail = emailDraft.trim()
                                    if (!nextEmail) {
                                      showRowNotice(member.id, { type: 'error', message: 'Email is required.' })
                                      return
                                    }
                                    void runAccountAction(member, {
                                      action: 'update_email',
                                      email: nextEmail,
                                    })
                                  }}
                                  className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEmailUserId(null)
                                    setEmailDraft('')
                                  }}
                                  className="rounded-md border border-brand-700 px-2.5 py-1.5 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {editingPasswordUserId === member.id && (
                        <tr className="bg-brand-900/40">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative w-full sm:max-w-sm">
                                  <input
                                    type={showPasswordDraft ? 'text' : 'password'}
                                    value={passwordDraft}
                                    onChange={(event) => {
                                      setPasswordDraft(event.target.value)
                                      if (passwordValidationMessage) {
                                        setPasswordValidationMessage('')
                                      }
                                    }}
                                    placeholder="Enter new password"
                                    className="w-full rounded-lg border border-brand-700 bg-brand-900 px-3 py-2 pr-10 text-sm text-white placeholder:text-brand-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPasswordDraft((prev) => !prev)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-300 transition-colors hover:text-white"
                                    aria-label={showPasswordDraft ? 'Hide password' : 'Show password'}
                                  >
                                    {showPasswordDraft ? (
                                      <EyeOffIcon className="h-4 w-4" />
                                    ) : (
                                      <EyeIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isSettingPassword}
                                    onClick={() => {
                                      if (passwordDraft.length < 8) {
                                        setPasswordValidationMessage('Password must be at least 8 characters.')
                                        return
                                      }
                                      void runAccountAction(member, {
                                        action: 'set_password',
                                        password: passwordDraft,
                                      })
                                    }}
                                    className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPasswordUserId(null)
                                      setPasswordDraft('')
                                      setShowPasswordDraft(false)
                                      setPasswordValidationMessage('')
                                    }}
                                    className="rounded-md border border-brand-700 px-2.5 py-1.5 text-xs text-brand-300 transition-colors hover:border-brand-600 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                              {passwordValidationMessage && (
                                <p className="text-xs text-amber-300">{passwordValidationMessage}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {rowNotice && (
                        <tr className="bg-brand-900/20">
                          <td colSpan={6} className="px-4 py-2">
                            <p
                              className={`text-xs ${
                                rowNotice.type === 'success' ? 'text-emerald-300' : 'text-red-300'
                              }`}
                            >
                              {rowNotice.message}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
                    <span className="inline-flex items-center gap-1">
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Has access
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <LockIcon className="h-3.5 w-3.5 text-red-400/60" /> No access
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-brand-800/70 bg-slate-950/20">
                    <div className="grid border-b border-brand-800/70" style={matrixGridColumns}>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-300/70">
                        Page
                      </div>
                      {nonAdminUsers.map((user) => {
                        const stats = userStats.get(user.id)

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
                                <p className="mt-1 text-[11px] font-mono">
                                  <span className="text-emerald-300/95">{stats?.granted ?? 0}</span>
                                  <span className="text-slate-400/80">/{stats?.total ?? NON_ADMIN_PAGES.length}</span>
                                </p>
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
                              const effective = getEffectiveAccess(user, page.slug)
                              const isSaving = savingCellKey === `user:${user.id}:${page.slug}`

                              return (
                                <div key={user.id} className="flex items-center border-l border-brand-800/40 px-2 py-1">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => void saveUserAccess(user, page.slug, !effective)}
                                    className={`flex h-9 w-full items-center justify-center text-xs transition-all duration-150 [transition-timing-function:ease] ${
                                      effective
                                        ? 'bg-emerald-400/5 hover:bg-emerald-400/10'
                                        : 'bg-red-500/[0.08] hover:bg-red-500/[0.12]'
                                    } ${isSaving ? 'cursor-not-allowed opacity-60' : ''}`}
                                    aria-label={`Set ${page.label} access for ${getUserFullName(user)}`}
                                  >
                                    {effective ? (
                                      <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                      <LockIcon className="h-3.5 w-3.5 text-red-400/60" />
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
                        <div className="border-b border-brand-800/70 px-4 py-4">
                          <h3 className="text-base font-semibold text-white">{getUserFullName(selectedUser)}</h3>
                          <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(selectedUser.role)}`}>
                            {formatRoleName(selectedUser.role)}
                          </span>
                          <p className="mt-2 text-xs font-mono">
                            <span className="text-emerald-300/95">{userStats.get(selectedUser.id)?.granted ?? 0}</span>
                            <span className="text-slate-400/80">/{NON_ADMIN_PAGES.length}</span>
                            <span className="text-slate-400/80"> pages granted</span>
                          </p>
                        </div>

                        <div className="space-y-4 p-4">
                          {groupedPages.map((group) => (
                            <div key={group.id} className="overflow-hidden rounded-lg border border-brand-800/60">
                              <div className="border-b border-brand-800/60 bg-slate-900/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400/70">
                                {group.label}
                              </div>
                              {group.pages.map((page) => {
                                const effective = getEffectiveAccess(selectedUser, page.slug)
                                const isSaving = savingCellKey === `user:${selectedUser.id}:${page.slug}`

                                return (
                                  <div
                                    key={page.slug}
                                    className="flex h-11 items-center justify-between border-t border-brand-800/40 px-3 transition-colors duration-150 [transition-timing-function:ease] hover:bg-slate-400/[0.03]"
                                  >
                                    <span className="text-sm text-slate-100">{page.label}</span>
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => void saveUserAccess(selectedUser, page.slug, !effective)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full px-1 transition-all duration-150 [transition-timing-function:ease] ${
                                        effective ? 'bg-emerald-400/30' : 'bg-red-500/25'
                                      } ${isSaving ? 'cursor-not-allowed opacity-60' : ''}`}
                                      aria-label={`Set ${page.label} access for ${getUserFullName(selectedUser)}`}
                                    >
                                      <span
                                        className={`flex h-4 w-4 items-center justify-center rounded-full transition-transform duration-150 [transition-timing-function:ease] ${
                                          effective
                                            ? 'bg-white text-emerald-500'
                                            : 'border border-red-300/30 bg-red-100/15 text-red-300/80'
                                        } ${
                                          effective ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                      >
                                        {effective ? (
                                          <CheckIcon className="h-2.5 w-2.5" />
                                        ) : (
                                          <LockIcon className="h-2.5 w-2.5" />
                                        )}
                                      </span>
                                    </button>
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
            </div>
          )}
        </section>
      )}
    </div>
  )
}
