'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (isSignUp) {
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || null
      const emailRedirectTo = origin ? `${origin}/auth/callback` : undefined

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-nex-navy px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <LoginAnchorIcon className="h-7 w-7 text-white" />
            <h1 className="text-3xl font-bold text-white">Helm</h1>
          </div>
          <p className="mt-2 text-brand-200">Web Production Command Center</p>
        </div>

        <div className="rounded-xl border border-brand-200 bg-white p-8 shadow-xl">
          <h2 className="mb-6 text-xl font-semibold text-nex-ink">
            {isSignUp ? 'Create an account' : 'Sign in'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-1 block text-sm font-medium text-nex-ink"
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required={isSignUp}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-nex-ink placeholder-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Jane Smith"
                />
              </div>
            )}

            <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-nex-ink"
                >
                  Email
                </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-nex-ink placeholder-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@company.com"
              />
            </div>

            <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-nex-ink"
                >
                  Password
                </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-nex-ink placeholder-brand-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-nex-red px-4 py-2.5 font-medium text-white transition-colors hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Please wait...'
                : isSignUp
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
              }}
              className="text-sm text-brand-600 transition-colors hover:text-brand-700"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginAnchorIcon({ className }: { className?: string }) {
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
