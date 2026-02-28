'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, UserPreferences } from '@/lib/types/database'

type ThemePreference = UserPreferences['theme']

type Toast = {
  tone: 'success' | 'error'
  message: string
}

function formatRoleLabel(role: Profile['role']) {
  if (role === 'admin') return 'Admin'
  if (role === 'senior_web_producer') return 'Senior Web Producer'
  return 'Producer'
}

function roleBadgeClass(role: Profile['role']) {
  if (role === 'admin') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
  if (role === 'senior_web_producer') return 'border-violet-500/40 bg-violet-500/15 text-violet-200'
  return 'border-blue-500/40 bg-blue-500/15 text-blue-200'
}

export default function ProfilePageClient() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [preferences, setPreferences] = useState<{
    theme: ThemePreference
    email_notifications: boolean
  }>({
    theme: 'system',
    email_notifications: true,
  })
  const [preferencesState, setPreferencesState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [prefsReady, setPrefsReady] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const didInitPrefs = useRef(false)

  const showToast = useCallback((tone: Toast['tone'], message: string) => {
    setToast({ tone, message })
    window.setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      setUserId(user.id)

      const [profileRes, prefRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      // Always read role directly from the profiles table for current auth user.
      const profileData = (profileRes.data ?? null) as Profile | null
      const prefData = (prefRes.data ?? null) as UserPreferences | null

      setProfile(profileData)
      setDisplayName(profileData?.full_name ?? '')
      setPreferences({
        theme: prefData?.theme ?? 'system',
        email_notifications: prefData?.email_notifications ?? true,
      })
      setPrefsReady(true)
      setLoading(false)
    }

    void loadProfile()
  }, [supabase])

  useEffect(() => {
    if (!prefsReady || !userId) return

    if (!didInitPrefs.current) {
      didInitPrefs.current = true
      return
    }

    setPreferencesState('saving')

    const timer = window.setTimeout(async () => {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            theme: preferences.theme,
            email_notifications: preferences.email_notifications,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

      if (!error) {
        setPreferencesState('saved')
        window.setTimeout(() => setPreferencesState('idle'), 1200)
      } else {
        setPreferencesState('idle')
        showToast('error', error.message)
      }
    }, 450)

    return () => window.clearTimeout(timer)
  }, [preferences, prefsReady, showToast, supabase, userId])

  async function saveDisplayName() {
    if (!profile || !displayName.trim()) return

    setNameSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: displayName.trim() })
      .eq('id', profile.id)

    if (error) {
      showToast('error', error.message)
      setNameSaving(false)
      return
    }

    setProfile({ ...profile, full_name: displayName.trim() })
    showToast('success', 'Account info saved')
    setNameSaving(false)
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      showToast('error', 'Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      showToast('error', 'Passwords do not match')
      return
    }

    setPasswordSaving(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      showToast('error', error.message)
      setPasswordSaving(false)
      return
    }

    setNewPassword('')
    setConfirmPassword('')
    showToast('success', 'Password updated')
    setPasswordSaving(false)
  }

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  const inputClass =
    'w-full rounded-xl border border-brand-700 bg-brand-900/70 px-3 py-2 text-white placeholder-brand-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40'

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center text-brand-400">
          Loading profile...
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-2xl border border-brand-800 bg-brand-900 px-6 py-12 text-center text-brand-400">
          Profile not found.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-lg border px-3 py-2 text-sm shadow-lg ${
            toast.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
              : 'border-red-500/30 bg-red-500/15 text-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        <p className="mt-1 text-brand-400">Manage your account and preferences.</p>
      </div>

      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <h2 className="text-lg font-semibold text-white">Account Info</h2>

        <div className="mt-5 flex flex-col gap-6 md:flex-row">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-700 text-lg font-semibold text-white">
            {initials}
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-300">Display Name</label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void saveDisplayName()}
                  disabled={nameSaving || !displayName.trim()}
                  className="rounded-full bg-nex-red px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {nameSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-500">Email</p>
                <p className="mt-1 text-sm text-white">{profile.email}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-500">Role</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${roleBadgeClass(profile.role)}`}
                >
                  {formatRoleLabel(profile.role)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <h2 className="text-lg font-semibold text-white">Change Password</h2>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-300">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClass}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-300">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={inputClass}
              placeholder="Re-enter password"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void changePassword()}
          disabled={passwordSaving || !newPassword || !confirmPassword}
          className="mt-5 rounded-full bg-nex-red px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-nex-redDark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {passwordSaving ? 'Updating...' : 'Update Password'}
        </button>
      </section>

      <section className="rounded-2xl border border-brand-800 bg-brand-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Preferences</h2>
          <span className="text-xs text-brand-500">
            {preferencesState === 'saving' && 'Saving...'}
            {preferencesState === 'saved' && 'Saved'}
          </span>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-brand-300">Theme</p>
            <div className="inline-flex rounded-xl border border-brand-700 bg-brand-900/60 p-1">
              {(['light', 'dark', 'system'] as ThemePreference[]).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setPreferences((prev) => ({ ...prev, theme }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    preferences.theme === theme
                      ? 'bg-brand-700 text-white'
                      : 'text-brand-300 hover:bg-brand-800 hover:text-white'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-brand-800 bg-brand-900/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Email Notifications</p>
              <p className="text-xs text-brand-500">Get notified about updates to your assigned work.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setPreferences((prev) => ({
                  ...prev,
                  email_notifications: !prev.email_notifications,
                }))
              }
              className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
                preferences.email_notifications ? 'bg-emerald-500/40' : 'bg-brand-700'
              }`}
              aria-label="Toggle email notifications"
            >
              <span
                className={`h-4 w-4 rounded-full bg-white transition-transform ${
                  preferences.email_notifications ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
