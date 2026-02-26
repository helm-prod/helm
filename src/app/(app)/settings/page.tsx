import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'

export default async function SettingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-brand-400 mb-8">
        Admin settings and user management.
      </p>

      {/* User list */}
      <div className="bg-brand-900 border border-brand-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-800">
          <h2 className="text-lg font-semibold text-white">Team Members</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-800 text-brand-400">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-800/50">
              {(users ?? []).map((u: Profile) => (
                <tr key={u.id} className="hover:bg-brand-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">
                    {u.full_name}
                  </td>
                  <td className="px-4 py-3 text-brand-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-700/50 text-brand-300 capitalize">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
