import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditorWorkspace } from '@/components/editor/editor-workspace'
import type { Profile, EditorFile, EditorFolder } from '@/lib/types/database'

export default async function EditorPage() {
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

  const [filesRes, foldersRes, teamFilesRes, profilesRes] = await Promise.all([
    supabase
      .from('editor_files')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('editor_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('editor_files')
      .select('*')
      .eq('visibility', 'team')
      .neq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase.from('profiles').select('*'),
  ])

  return (
    <EditorWorkspace
      currentUser={profile as Profile}
      profiles={(profilesRes.data ?? []) as Profile[]}
      initialFiles={(filesRes.data ?? []) as EditorFile[]}
      initialFolders={(foldersRes.data ?? []) as EditorFolder[]}
      initialTeamFiles={(teamFilesRes.data ?? []) as EditorFile[]}
    />
  )
}
