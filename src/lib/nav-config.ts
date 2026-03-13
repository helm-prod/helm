import type { UserRole } from '@/lib/types/database'

type NavBase = {
  label: string
  icon: string
  roles?: UserRole[]
}

export type NavItem = NavBase & {
  type?: 'item'
  slug: string
  href: string
  adminOnly?: boolean
}

export type RoleDefinition = {
  value: UserRole
  label: string
}

export type NavSection = NavBase & {
  type: 'section'
  id: string
  children: NavItem[]
}

export type SidebarNavItem = NavItem | NavSection

export const NAV_STRUCTURE: SidebarNavItem[] = [
  { slug: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { slug: 'my-queue', href: '/my-queue', label: 'My Queue', icon: 'ListTodo' },
  { slug: 'ad-weeks', href: '/ad-weeks', label: 'Ad Weeks', icon: 'CalendarRange' },
  { slug: 'calendar', href: '/calendar', label: 'Calendar', icon: 'Calendar' },
  { slug: 'editor', href: '/editor', label: 'Editor', icon: 'Code' },
  { slug: 'templates', href: '/templates', label: 'Templates', icon: 'Layout' },
  { slug: 'carousels', href: '/carousels', label: 'Carousels', icon: 'GalleryHorizontalEnd' },
  {
    type: 'section',
    id: 'pages',
    label: 'Pages',
    icon: 'Files',
    children: [{ slug: 'wog', href: '/wog', label: 'WOG Events', icon: 'CalendarDays' }],
  },
  { slug: 'upload', href: '/upload', label: 'Upload', icon: 'Upload' },
  { slug: 'aor-settings', href: '/aor-settings', label: 'AOR Settings', icon: 'Settings2' },
  {
    type: 'section',
    id: 'analytics',
    label: 'Analytics',
    icon: 'BarChart3',
    children: [
      { slug: 'analytics-search', href: '/analytics/search', label: 'Search Performance', icon: 'Search' },
      { slug: 'analytics-products', href: '/analytics/products', label: 'Products', icon: 'Package' },
      { slug: 'analytics-performance', href: '/analytics/performance', label: 'Site Performance', icon: 'Activity' },
      { slug: 'analytics-speed', href: '/analytics/speed', label: 'Site Speed', icon: 'Gauge' },
    ],
  },
  {
    type: 'section',
    id: 'site-quality',
    label: 'Site Quality',
    icon: 'Shield',
    children: [
      { slug: 'site-quality-link-health', href: '/site-quality/link-health', label: 'Link Health', icon: 'Shield' },
      {
        slug: 'site-quality-panel-intelligence',
        href: '/site-quality/panel-intelligence',
        label: 'Panel Intelligence',
        icon: 'Shield',
      },
    ],
  },
  { slug: 'sops', href: '/sops', label: 'SOPs', icon: 'BookOpen' },
  { slug: 'requests', href: '/requests', label: 'Requests', icon: 'MessageSquare' },
  { slug: 'bugs', href: '/bugs', label: 'Bug Reports', icon: 'Bug' },
  { slug: 'settings', href: '/settings', label: 'Settings', icon: 'Settings' },
  { slug: 'profile', href: '/profile', label: 'Profile', icon: 'User' },
  { slug: 'admin', href: '/admin', label: 'Admin', icon: 'Shield', adminOnly: true },
]

function flattenNavItems(items: SidebarNavItem[]): NavItem[] {
  return items.flatMap((item) => (item.type === 'section' ? flattenNavItems(item.children) : item))
}

export const NAV_ITEMS: NavItem[] = flattenNavItems(NAV_STRUCTURE)

export const ROLES: RoleDefinition[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'senior_web_producer', label: 'Senior Web Producer' },
  { value: 'producer', label: 'Producer' },
  { value: 'wog_editor', label: 'WOG Editor' },
]

export const NON_ADMIN_ROLES = ROLES.filter((role) => role.value !== 'admin')

const ROLE_NAME_MAP: Record<UserRole, string> = {
  admin: 'Admin',
  senior_web_producer: 'Senior Web Producer',
  producer: 'Producer',
  wog_editor: 'WOG Editor',
}

export function formatRoleName(role: string): string {
  if (role in ROLE_NAME_MAP) {
    return ROLE_NAME_MAP[role as UserRole]
  }
  return role
}

export function getNavItem(slug: string) {
  return NAV_ITEMS.find((item) => item.slug === slug)
}

export function isNavSection(item: SidebarNavItem): item is NavSection {
  return item.type === 'section'
}
