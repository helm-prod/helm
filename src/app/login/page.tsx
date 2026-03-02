'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { RadarAnimation } from '@/components/radar-animation'

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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0a1628] via-[#0d1f3c] to-[#0a1628]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(207,167,81,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(207,167,81,0.08) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <RadarAnimation size={600} className="opacity-10" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <RadarAnimation size={100} />
          <h1 className="mt-4 text-[50px] font-extrabold leading-none tracking-[0.18em] text-white">
            <span className="text-[#CFA751]">H</span>ELM
          </h1>

          <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/75">
            <span className="text-[#CFA751]">Hub</span>{' '}
            <span className="text-white/30">for</span>{' '}
            <span className="text-[#CFA751]">Ecommerce</span>{' '}
            <span className="text-[#CFA751]">Logistics</span>{' '}
            <span className="text-white/30">&amp;</span>{' '}
            <span className="text-[#CFA751]">Management</span>
          </p>

          <div className="mt-5 h-px w-72 bg-gradient-to-r from-transparent via-[#CFA751]/70 to-transparent" />
          <p className="mt-3 text-[10px] uppercase tracking-[0.35em] text-white/40">NEXCOM Web Operations</p>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-[#CFA751]/15 bg-[#0a1628]/72 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#CFA751]">
            {isSignUp ? 'Create account' : 'Sign in'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#CFA751]/75"
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required={isSignUp}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[#CFA751]/20 bg-[#071121]/85 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#CFA751]/70 focus:outline-none focus:ring-2 focus:ring-[#CFA751]/25"
                  placeholder="Jane Smith"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#CFA751]/75"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#CFA751]/20 bg-[#071121]/85 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#CFA751]/70 focus:outline-none focus:ring-2 focus:ring-[#CFA751]/25"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#CFA751]/75"
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
                className="w-full rounded-lg border border-[#CFA751]/20 bg-[#071121]/85 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#CFA751]/70 focus:outline-none focus:ring-2 focus:ring-[#CFA751]/25"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-[#CFA751] to-[#B8912E] px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0a1628] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="text-sm text-gold-400 transition-colors hover:text-gold-300"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.16em] text-white/30">
          Navy Exchange Command • Authorized Personnel
        </p>
      </div>
    </div>
  )
}
