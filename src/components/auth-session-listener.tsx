'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function isPublicPath(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/auth')
}

export function AuthSessionListener() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let active = true

    const ensureSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!active) return
      if (!session && !isPublicPath(pathname)) {
        router.replace('/login')
      }
    }

    ensureSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !isPublicPath(pathname)) {
        if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          router.replace('/login')
        }
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [pathname, router, supabase])

  return null
}
