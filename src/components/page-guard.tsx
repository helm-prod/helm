import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { checkPageAccess } from '@/lib/permissions'

export async function PageGuard({
  pageSlug,
  children,
}: {
  pageSlug: string
  children: React.ReactNode
}) {
  const supabase = createClient()
  const hasAccess = await checkPageAccess(supabase, pageSlug)

  if (!hasAccess) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-2xl border border-brand-800 bg-brand-900 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Access Restricted</h2>
          <p className="mt-3 text-brand-300">
            You don&apos;t have access to this page. Contact your administrator.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center rounded-full bg-nex-red px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-nex-redDark"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
