export type NavItem = {
  slug: string
  label: string
  icon: string
  adminOnly?: boolean
}

export type RoleDefinition = {
  value: 'admin' | 'senior_web_producer' | 'producer'
  label: string
}

export const NAV_ITEMS: NavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { slug: 'my-queue', label: 'My Queue', icon: 'ListTodo' },
  { slug: 'ad-weeks', label: 'Ad Weeks', icon: 'CalendarRange' },
  { slug: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { slug: 'editor', label: 'Editor', icon: 'Code' },
  { slug: 'templates', label: 'Templates', icon: 'Layout' },
  { slug: 'carousels', label: 'Carousels', icon: 'GalleryHorizontalEnd' },
  { slug: 'wog', label: 'WOG Events', icon: 'CalendarDays' },
  { slug: 'upload', label: 'Upload', icon: 'Upload' },
  { slug: 'aor-settings', label: 'AOR Settings', icon: 'Settings2' },
  { slug: 'analytics-search', label: 'Search Performance', icon: 'Search' },
  { slug: 'analytics-products', label: 'Products', icon: 'Package' },
  { slug: 'analytics-performance', label: 'Site Performance', icon: 'Activity' },
  { slug: 'analytics-speed', label: 'Site Speed', icon: 'Gauge' },
  { slug: 'site-quality-link-health', label: 'Link Health', icon: 'Shield' },
  { slug: 'site-quality-panel-intelligence', label: 'Panel Intelligence', icon: 'Shield' },
  { slug: 'sops', label: 'SOPs', icon: 'BookOpen' },
  { slug: 'requests', label: 'Requests', icon: 'MessageSquare' },
  { slug: 'bugs', label: 'Bug Reports', icon: 'Bug' },
  { slug: 'settings', label: 'Settings', icon: 'Settings' },
  { slug: 'profile', label: 'Profile', icon: 'User' },
  { slug: 'admin', label: 'Admin', icon: 'Shield', adminOnly: true },
]

export const ROLES: RoleDefinition[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'senior_web_producer', label: 'Senior Web Producer' },
  { value: 'producer', label: 'Producer' },
]

export const NON_ADMIN_ROLES = ROLES.filter((role) => role.value !== 'admin')

const ROLE_NAME_MAP: Record<RoleDefinition['value'], string> = {
  admin: 'Admin',
  senior_web_producer: 'Senior Web Producer',
  producer: 'Producer',
}

export function formatRoleName(role: string): string {
  if (role in ROLE_NAME_MAP) {
    return ROLE_NAME_MAP[role as RoleDefinition['value']]
  }
  return role
}

export function getNavItem(slug: string) {
  return NAV_ITEMS.find((item) => item.slug === slug)
}
