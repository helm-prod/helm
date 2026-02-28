'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAccessibleSlugs, getUserRole } from '@/lib/permissions'
import { NAV_ITEMS } from '@/lib/nav-config'
import type { Profile, UserRole } from '@/lib/types/database'

type IconComponent = ({ className }: { className?: string }) => JSX.Element

const ICON_MAP: Record<string, IconComponent> = {
  LayoutDashboard: LayoutDashboardIcon,
  ListTodo: ListTodoIcon,
  CalendarRange: CalendarRangeIcon,
  Calendar: CalendarIcon,
  Code: CodeIcon,
  Layout: LayoutIcon,
  Upload: UploadIcon,
  Settings2: Settings2Icon,
  BookOpen: BookOpenIcon,
  MessageSquare: MessageSquareIcon,
  Settings: SettingsIcon,
  User: UserIcon,
  Shield: ShieldIcon,
  Lock: LockIcon,
}

export function Sidebar({ profile, myQueueCount }: { profile: Profile; myQueueCount: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [role, setRole] = useState<UserRole>(profile.role)
  const [accessibleSlugs, setAccessibleSlugs] = useState<Set<string>>(
    () => new Set(profile.role === 'admin' ? NAV_ITEMS.map((item) => item.slug) : []),
  )

  useEffect(() => {
    let active = true

    async function loadPermissions() {
      const resolvedRole = await getUserRole(supabase)
      const slugs = await getAccessibleSlugs(supabase, resolvedRole)

      if (!active) return
      setRole(resolvedRole)
      setAccessibleSlugs(slugs)
    }

    void loadPermissions()

    return () => {
      active = false
    }
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = NAV_ITEMS.filter((item) => !(item.adminOnly && role !== 'admin'))

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r border-brand-800 bg-nex-navy">
      <div className="border-b border-brand-800 p-6">
        <Link href="/dashboard" className="block">
          <div className="flex items-center gap-2">
            <AnchorIcon className="h-5 w-5 text-white" />
            <h1 className="text-lg font-bold text-white">Helm</h1>
          </div>
          <p className="mt-0.5 text-xs text-brand-200">Web Production Command Center</p>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const href = `/${item.slug}`
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboardIcon
          const isActive =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
          const hasAccess = accessibleSlugs.has(item.slug)

          if (!hasAccess) {
            return (
              <div
                key={item.slug}
                className="group relative flex cursor-default items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-brand-100 opacity-40"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex items-center gap-2">
                    {item.label}
                    <LockIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
                {item.slug === 'my-queue' && myQueueCount > 0 && (
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-nex-red px-2 py-0.5 text-xs font-semibold text-white">
                    {myQueueCount}
                  </span>
                )}
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-brand-700 bg-brand-900 px-2 py-1 text-xs text-brand-200 shadow-lg group-hover:block">
                  You don&apos;t currently have access
                </span>
              </div>
            )
          }

          return (
            <Link
              key={item.slug}
              href={href}
              className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-brand-700 bg-nex-navyLight/70 text-white shadow-[inset_4px_0_0_0_#C8102E]'
                  : 'border-transparent text-brand-100 hover:border-brand-700 hover:bg-brand-800/70 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </span>
              {item.slug === 'my-queue' && myQueueCount > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-nex-red px-2 py-0.5 text-xs font-semibold text-white">
                  {myQueueCount}
                </span>
              )}
            </Link>
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
            <p className="text-xs capitalize text-brand-500">{role}</p>
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

function AnchorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5a1.75 1.75 0 100 3.5 1.75 1.75 0 000-3.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 11h10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12.5c0 4 3.6 7 8 7s8-3 8-7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12.5l3 2.5M20 12.5l-3 2.5" />
    </svg>
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

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 3v6.75c0 4.08-2.69 7.77-6.75 9-4.06-1.23-6.75-4.92-6.75-9V6L12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 12.75l1.5 1.5 3-3" />
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
