import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Profile, SopDocument, SopStatus } from '@/lib/types/database'
import { SOP_STATUS_LABELS } from '@/lib/types/database'
import { PageGuard } from '@/components/page-guard'

export default async function SOPsPage() {
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

  if (!profile) redirect('/login')

  const p = profile as Profile
  const isAdmin = p.role === 'admin'

  const { data: sops } = await supabase
    .from('sop_documents')
    .select('*, creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
    .order('title')

  // Get user's acknowledgments
  const { data: acks } = await supabase
    .from('sop_acknowledgments')
    .select('sop_id, version_acknowledged')
    .eq('user_id', user.id)

  const ackMap: Record<string, number> = {}
  for (const ack of acks ?? []) {
    ackMap[ack.sop_id] = Math.max(ackMap[ack.sop_id] ?? 0, ack.version_acknowledged)
  }

  return (
    <PageGuard pageSlug="sops">
      <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Standard Operating Procedures
          </h1>
          <p className="text-brand-400 mt-1">
            Reference guides for all production workflows.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/sops/new"
            className="px-4 py-2.5 bg-gold-400 hover:bg-gold-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Create SOP
          </Link>
        )}
      </div>

      {!sops || sops.length === 0 ? (
        <div className="bg-brand-900 border border-brand-800 rounded-xl px-6 py-12 text-center text-brand-500">
          No SOPs have been created yet.
          {isAdmin && (
            <>
              {' '}
              <Link href="/sops/new" className="text-brand-400 hover:text-white underline">
                Create the first one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sops.map((sop: SopDocument & { creator: { full_name: string } | null; updater: { full_name: string } | null }) => {
            const needsAck = sop.requires_acknowledgment && sop.status === 'published'
            const userAckedVersion = ackMap[sop.id] ?? 0
            const isUnacked = needsAck && userAckedVersion < sop.version

            return (
              <Link
                key={sop.id}
                href={`/sops/${sop.slug}`}
                className="bg-brand-900 border border-brand-800 rounded-xl p-5 hover:border-brand-600 transition-colors group block"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-800 flex items-center justify-center shrink-0 group-hover:bg-brand-700 transition-colors">
                      <svg
                        className="w-4 h-4 text-brand-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white group-hover:text-brand-200 transition-colors">
                        {sop.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-brand-500">
                        <span>v{sop.version}</span>
                        <span className="text-brand-700">&middot;</span>
                        <span>{SOP_STATUS_LABELS[sop.status as SopStatus]}</span>
                        {sop.updater && (
                          <>
                            <span className="text-brand-700">&middot;</span>
                            <span>Updated by {sop.updater.full_name}</span>
                          </>
                        )}
                        {sop.updated_at && (
                          <>
                            <span className="text-brand-700">&middot;</span>
                            <span>{new Date(sop.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {isUnacked && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                        Needs Review
                      </span>
                    )}
                    {needsAck && !isUnacked && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                        Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      </div>
    </PageGuard>
  )
}
