import type { UserRole } from '@/lib/types/database'

export const WOG_EDITOR_ALLOWED_HREFS: readonly string[] = ['/wog']
export const WOG_EDITOR_ALLOWED_SLUGS: readonly string[] = ['wog']

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (
    role === 'admin' ||
    role === 'senior_web_producer' ||
    role === 'producer' ||
    role === 'wog_editor'
  ) {
    return role
  }

  return 'wog_editor'
}

export function isWogEditorPathAllowed(pathname: string): boolean {
  return WOG_EDITOR_ALLOWED_HREFS.some((href) => pathname === href || pathname.startsWith(`${href}/`))
}
