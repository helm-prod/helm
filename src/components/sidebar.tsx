'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BarChart3,
  Bug,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Image,
  Files,
  GalleryHorizontalEnd,
  Gauge,
  Package,
  Search,
  Shield,
} from 'lucide-react'
import { MiniRadar } from '@/components/radar-animation'
import { createClient } from '@/lib/supabase/client'
import { formatRoleName, isNavSection, NAV_ITEMS, NAV_STRUCTURE, type NavItem, type SidebarNavItem } from '@/lib/nav-config'
import { getEffectiveAccess, getUserRole } from '@/lib/permissions'
import { normalizeUserRole, WOG_EDITOR_ALLOWED_HREFS } from '@/lib/roles'
import type { Profile, UserRole } from '@/lib/types/database'

type IconComponent = ({ className }: { className?: string }) => ReactNode
type ExpandedSections = Record<string, boolean>

const ICON_MAP: Record<string, IconComponent> = {
  Activity,
  BarChart3,
  Bug,
  Calendar: CalendarIcon,
  CalendarDays,
  CalendarRange: CalendarRangeIcon,
  Code: CodeIcon,
  Files,
  GalleryHorizontalEnd,
  Gauge,
  Image,
  Layout: LayoutIcon,
  LayoutDashboard: LayoutDashboardIcon,
  ListTodo: ListTodoIcon,
  Lock: LockIcon,
  MessageSquare: MessageSquareIcon,
  Package,
  Search,
  Settings: SettingsIcon,
  Settings2: Settings2Icon,
  Shield,
  Upload: UploadIcon,
  User: UserIcon,
  BookOpen: BookOpenIcon,
}

const LOCAL_STORAGE_PREFIX = 'helm_nav_open_'

function isLinkActive(href: string, pathname: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}

function filterNavForRole(items: SidebarNavItem[], role: UserRole): SidebarNavItem[] {
  const roleFiltered = items
    .map((item) => {
      if (item.roles && !item.roles.includes(role)) {
        return null
      }

      if (isNavSection(item)) {
        const children = item.children.filter((child) => !child.roles || child.roles.includes(role))
        return children.length > 0 ? { ...item, children } : null
      }

      return item
    })
    .filter(Boolean) as SidebarNavItem[]

  if (role !== 'wog_editor') {
    return roleFiltered
  }

  return roleFiltered
    .map((item) => {
      if (isNavSection(item)) {
        const children = item.children.filter((child) => WOG_EDITOR_ALLOWED_HREFS.includes(child.href))
        return children.length > 0 ? { ...item, children } : null
      }

      return WOG_EDITOR_ALLOWED_HREFS.includes(item.href) ? item : null
    })
    .filter(Boolean) as SidebarNavItem[]
}

function makeInitialAccessSet(role: UserRole) {
  if (role === 'admin') {
    return new Set(NAV_ITEMS.map((item) => item.slug))
  }

  if (role === 'wog_editor') {
    return new Set(['wog'])
  }

  return new Set<string>()
}

function shouldRenderItem(item: NavItem, role: UserRole) {
  return !(item.adminOnly && role !== 'admin')
}

export function Sidebar({ profile, myQueueCount }: { profile: Profile; myQueueCount: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const initialRole = normalizeUserRole(profile.role)
  const [role, setRole] = useState<UserRole>(initialRole)
  const [accessibleSlugs, setAccessibleSlugs] = useState<Set<string>>(() => makeInitialAccessSet(initialRole))
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({})

  useEffect(() => {
    let active = true

    async function loadPermissions() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const resolvedRole = await getUserRole(supabase)
      const slugs = await getEffectiveAccess(supabase, user.id, resolvedRole)

      if (!active) return
      setRole(resolvedRole)
      setAccessibleSlugs(slugs)
    }

    void loadPermissions()

    return () => {
      active = false
    }
  }, [supabase])

  const navItems = useMemo(
    () =>
      filterNavForRole(NAV_STRUCTURE, role)
        .map((item) => {
          if (isNavSection(item)) {
            const children = item.children.filter((child) => shouldRenderItem(child, role))
            return children.length > 0 ? { ...item, children } : null
          }

          return shouldRenderItem(item, role) ? item : null
        })
        .filter(Boolean) as SidebarNavItem[],
    [role],
  )

  useEffect(() => {
    const nextState: ExpandedSections = {}

    for (const item of navItems) {
      if (!isNavSection(item)) continue

      const storageKey = `${LOCAL_STORAGE_PREFIX}${item.label}`
      const storedValue = window.localStorage.getItem(storageKey)
      const hasActiveChild = item.children.some((child) => isLinkActive(child.href, pathname))

      nextState[item.id] = storedValue === null ? true : storedValue === 'true' || hasActiveChild
    }

    setExpandedSections(nextState)
  }, [navItems, pathname])

  useEffect(() => {
    setExpandedSections((current) => {
      const next = { ...current }
      let changed = false

      for (const item of navItems) {
        if (!isNavSection(item)) continue

        if (item.children.some((child) => isLinkActive(child.href, pathname)) && !next[item.id]) {
          next[item.id] = true
          window.localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${item.label}`, 'true')
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [navItems, pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function toggleSection(sectionId: string, label: string) {
    setExpandedSections((current) => {
      const nextValue = !(current[sectionId] ?? true)
      window.localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${label}`, String(nextValue))
      return { ...current, [sectionId]: nextValue }
    })
  }

  const roleLabel = formatRoleName(role)

  function renderNavLink(item: NavItem, isChild = false) {
    const Icon = ICON_MAP[item.icon] ?? LayoutDashboardIcon
    const isActive = isLinkActive(item.href, pathname)
    const hasAccess = accessibleSlugs.has(item.slug)
    const commonClass = `group flex items-center justify-between rounded-xl border py-2.5 text-sm font-medium transition-colors ${
      isChild ? 'pl-10 pr-3' : 'px-3'
    } ${
      isActive
        ? 'border-brand-700 bg-nex-navyLight/70 text-white shadow-[inset_4px_0_0_0_#CFA751]'
        : 'border-transparent text-brand-100 hover:border-brand-700 hover:bg-brand-800/70 hover:text-white'
    }`

    if (!hasAccess) {
      return (
        <div
          key={item.slug}
          title="You don't currently have access"
          className={`flex cursor-default items-center justify-between rounded-xl border border-transparent py-2.5 text-sm font-medium text-brand-100 opacity-40 ${
            isChild ? 'pl-10 pr-3' : 'px-3'
          }`}
        >
          <span className="flex items-center gap-3">
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex items-center gap-2">
              {item.label}
              <LockIcon className="h-3.5 w-3.5" />
            </span>
          </span>
          {item.slug === 'my-queue' && myQueueCount > 0 ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-white">
              {myQueueCount}
            </span>
          ) : null}
        </div>
      )
    }

    return (
      <Link key={item.slug} href={item.href} className={commonClass}>
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          {item.label}
        </span>
        {item.slug === 'my-queue' && myQueueCount > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-white">
            {myQueueCount}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r border-brand-800 bg-nex-navy">
      <div className="border-b border-gold-400/10 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <MiniRadar size={36} />
          <div>
            <div className="text-lg font-extrabold leading-none tracking-[0.15em] text-white">
              <span className="text-gold-400">H</span>ELM
            </div>
            <div className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-white/35">
              Ecommerce Logistics & Mgmt
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          if (!isNavSection(item)) {
            return renderNavLink(item)
          }

          const Icon = ICON_MAP[item.icon] ?? LayoutDashboardIcon
          const isOpen = expandedSections[item.id] ?? true
          const hasActiveChild = item.children.some((child) => isLinkActive(child.href, pathname))
          const sectionClass = `group flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
            hasActiveChild
              ? 'border-brand-700 bg-nex-navyLight/70 text-white shadow-[inset_4px_0_0_0_#CFA751]'
              : 'border-transparent text-brand-100 hover:border-brand-700 hover:bg-brand-800/70 hover:text-white'
          }`

          return (
            <div key={item.id} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSection(item.id, item.label)}
                className={sectionClass}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                )}
              </button>

              {isOpen ? <div className="space-y-1">{item.children.map((child) => renderNavLink(child, true))}</div> : null}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-brand-800 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-medium text-white">
            {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{profile.full_name}</p>
            <p className="text-xs text-brand-500">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full rounded-xl px-3 py-2 text-left text-sm text-brand-200 transition-colors hover:bg-brand-800 hover:text-white"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function LayoutDashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}

function ListTodoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h9.75m-9.75 5.25h9.75m-9.75 5.25h9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 7.5h2.25m-2.25 4.5h2.25m-2.25 4.5h2.25" />
    </svg>
  )
}

function CalendarRangeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75v3m9-3v3M4.5 8.25h15M5.25 5.25h13.5A1.5 1.5 0 0120.25 6.75v11.5a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 13.5h3m3 0h3M7.5 16.5h9" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 8.25h16.5M7.5 3.75v3m9-3.75v3M6 21h12a2.25 2.25 0 002.25-2.25V7.5A2.25 2.25 0 0018 5.25H6A2.25 2.25 0 003.75 7.5v11.25A2.25 2.25 0 006 21z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12h3m3 0h3m-9 4.5h3m3 0h3" />
    </svg>
  )
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25L3.75 12l4.5 3.75M15.75 8.25L20.25 12l-4.5 3.75M13.5 4.5l-3 15" />
    </svg>
  )
}

function LayoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25A1.5 1.5 0 015.25 3.75h13.5a1.5 1.5 0 011.5 1.5v13.5a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V5.25z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75v16.5M9 9h11.25" />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function Settings2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75v5.5m0 5v6m4.5-16.5v11m0 5.5v.25m4.5-12.75v12.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9.25h4.5m-2.25 5h4.5m2.25-5h3" />
    </svg>
  )
}

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function MessageSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 17.25H4.5a1.5 1.5 0 01-1.5-1.5V6.75a1.5 1.5 0 011.5-1.5h15a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H12l-4.5 3v-3z" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.875a4.5 4.5 0 10-9 0V10.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.5h12A1.5 1.5 0 0119.5 12v7.5A1.5 1.5 0 0118 21H6a1.5 1.5 0 01-1.5-1.5V12A1.5 1.5 0 016 10.5z" />
    </svg>
  )
}
