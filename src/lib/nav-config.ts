export type NavItem = {
  slug: string
  label: string
  icon: string
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { slug: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { slug: 'my-queue', label: 'My Queue', icon: 'ListTodo' },
  { slug: 'ad-weeks', label: 'Ad Weeks', icon: 'CalendarRange' },
  { slug: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { slug: 'editor', label: 'Editor', icon: 'Code' },
  { slug: 'templates', label: 'Templates', icon: 'Layout' },
  { slug: 'upload', label: 'Upload', icon: 'Upload' },
  { slug: 'aor-settings', label: 'AOR Settings', icon: 'Settings2' },
  { slug: 'sops', label: 'SOPs', icon: 'BookOpen' },
  { slug: 'requests', label: 'Requests', icon: 'MessageSquare' },
  { slug: 'settings', label: 'Settings', icon: 'Settings' },
  { slug: 'profile', label: 'Profile', icon: 'User' },
  { slug: 'admin', label: 'Admin', icon: 'Shield', adminOnly: true },
]

export function getNavItem(slug: string) {
  return NAV_ITEMS.find((item) => item.slug === slug)
}
