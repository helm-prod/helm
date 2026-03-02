'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CodeEditor } from './code-editor'
import { LivePreview, composeDocument, type PreviewCompanionFile } from './live-preview'
import { FileSidebar } from './file-sidebar'
import { AiPrompt } from './ai-prompt'
import type { EditorFile, EditorFolder, EditorTeamFolder, EditorFileVersion, EditorLanguage, FileVisibility, Profile } from '@/lib/types/database'

interface EditorWorkspaceProps {
  currentUser: Profile
  profiles: Profile[]
  initialFiles: EditorFile[]
  initialFolders: EditorFolder[]
  initialTeamFiles: EditorFile[]
  initialTeamFolders: EditorTeamFolder[]
}

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

const DEFAULT_CONTENT: Record<EditorLanguage, string> = {
  html: '<!-- Start writing HTML -->\n<div class="container">\n  <h1>Hello, Helm</h1>\n  <p>Start building your panel code here.</p>\n</div>',
  css: '/* Start writing CSS */\n.container {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 16px;\n}\n\nh1 {\n  color: #003057;\n}',
  javascript: '// Start writing JavaScript\nconsole.log("Hello from Helm editor!");',
}

export function EditorWorkspace({ currentUser, profiles, initialFiles, initialFolders, initialTeamFiles, initialTeamFolders }: EditorWorkspaceProps) {
  const supabase = createClient()
  const [files, setFiles] = useState<EditorFile[]>(initialFiles)
  const [folders, setFolders] = useState<EditorFolder[]>(initialFolders)
  const [teamFiles, setTeamFiles] = useState<EditorFile[]>(initialTeamFiles)
  const [teamFolders, setTeamFolders] = useState<EditorTeamFolder[]>(initialTeamFolders)
  const [activeFile, setActiveFile] = useState<EditorFile | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [splitRatio, setSplitRatio] = useState(55)
  const [showPreview, setShowPreview] = useState(false)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [versionHistory, setVersionHistory] = useState<EditorFileVersion[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)

  const autoSaveTimerRef = useRef<NodeJS.Timeout>()
  const lastSavedContentRef = useRef('')
  const isDraggingRef = useRef(false)
  const isDraggingSidebarRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activeFile) return
    if (editorContent === lastSavedContentRef.current) { setSaveStatus('saved'); return }
    setSaveStatus('unsaved')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { autoSaveFile() }, 2000)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent])

  const autoSaveFile = useCallback(async () => {
    if (!activeFile) return
    setSaveStatus('saving')
    const { error } = await supabase.from('editor_files').update({ content: editorContent, updated_at: new Date().toISOString() }).eq('id', activeFile.id)
    if (error) { setSaveStatus('error') } else {
      lastSavedContentRef.current = editorContent
      setSaveStatus('saved')
      const nextUpdatedAt = new Date().toISOString()
      setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, content: editorContent, updated_at: nextUpdatedAt } : f)))
      setTeamFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, content: editorContent, updated_at: nextUpdatedAt } : f)))
      setActiveFile((prev) => prev ? { ...prev, content: editorContent, updated_at: nextUpdatedAt } : null)
    }
  }, [activeFile, editorContent, supabase])

  const manualSave = useCallback(async () => {
    if (!activeFile) return
    setSaveStatus('saving')
    const { error: updateError } = await supabase.from('editor_files').update({ content: editorContent, updated_at: new Date().toISOString() }).eq('id', activeFile.id)
    if (updateError) { setSaveStatus('error'); return }
    await supabase.from('editor_file_versions').insert({ file_id: activeFile.id, content: editorContent, created_by: currentUser.id })
    const { data: versions } = await supabase.from('editor_file_versions').select('id').eq('file_id', activeFile.id).order('created_at', { ascending: false })
    if (versions && versions.length > 20) {
      const toDelete = versions.slice(20).map((v) => v.id)
      await supabase.from('editor_file_versions').delete().in('id', toDelete)
    }
    lastSavedContentRef.current = editorContent
    setSaveStatus('saved')
    const nextUpdatedAt = new Date().toISOString()
    setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, content: editorContent, updated_at: nextUpdatedAt } : f)))
    setTeamFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, content: editorContent, updated_at: nextUpdatedAt } : f)))
    setActiveFile((prev) => prev ? { ...prev, content: editorContent, updated_at: nextUpdatedAt } : null)
  }, [activeFile, editorContent, currentUser.id, supabase])

  const loadVersionHistory = useCallback(async () => {
    if (!activeFile) return
    const { data } = await supabase.from('editor_file_versions').select('*, creator:profiles!created_by(full_name)').eq('file_id', activeFile.id).order('created_at', { ascending: false }).limit(20)
    setVersionHistory((data as EditorFileVersion[]) ?? [])
    setShowHistory(true)
  }, [activeFile, supabase])

  const restoreVersion = useCallback((version: EditorFileVersion) => {
    setEditorContent(version.content)
    setShowHistory(false)
  }, [])

  const selectFile = useCallback((file: EditorFile) => {
    if (activeFile && editorContent !== lastSavedContentRef.current) autoSaveFile()
    setActiveFile(file)
    setEditorContent(file.content)
    lastSavedContentRef.current = file.content
    setSaveStatus('saved')
    setShowHistory(false)
    setIsRenamingTitle(false)
    setTitleDraft('')
    setIsAddingTag(false)
    setNewTagValue('')
  }, [activeFile, editorContent, autoSaveFile])

  const findFileAcrossLists = useCallback((fileId: string): EditorFile | null => {
    return files.find((file) => file.id === fileId)
      ?? teamFiles.find((file) => file.id === fileId)
      ?? (activeFile?.id === fileId ? activeFile : null)
  }, [activeFile, files, teamFiles])

  const placeInPrivateFiles = useCallback((updatedFile: EditorFile) => {
    setFiles((prev) => [updatedFile, ...prev.filter((file) => file.id !== updatedFile.id)])
    setTeamFiles((prev) => prev.filter((file) => file.id !== updatedFile.id))
    setActiveFile((prev) => prev && prev.id === updatedFile.id ? updatedFile : prev)
  }, [])

  const placeInTeamFiles = useCallback((updatedFile: EditorFile) => {
    setTeamFiles((prev) => [updatedFile, ...prev.filter((file) => file.id !== updatedFile.id)])
    setFiles((prev) => prev.filter((file) => file.id !== updatedFile.id))
    setActiveFile((prev) => prev && prev.id === updatedFile.id ? updatedFile : prev)
  }, [])

  const createFile = useCallback(async (folderId: string | null) => {
    const { data, error } = await supabase.from('editor_files').insert({
      user_id: currentUser.id, folder_id: folderId, title: 'Untitled', language: 'html' as EditorLanguage, content: DEFAULT_CONTENT['html'], visibility: 'private' as FileVisibility,
    }).select().single()
    if (error || !data) return
    const newFile = data as EditorFile
    setFiles((prev) => [newFile, ...prev])
    selectFile(newFile)
  }, [currentUser.id, supabase, selectFile])

  const createFolder = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('editor_folders').insert({ user_id: currentUser.id, name, sort_order: folders.length }).select().single()
    if (error || !data) return
    setFolders((prev) => [...prev, data as EditorFolder])
  }, [currentUser.id, folders.length, supabase])

  const createTeamFolder = useCallback(async (name: string) => {
    const { data, error } = await supabase.from('editor_team_folders').insert({ name, created_by: currentUser.id, sort_order: teamFolders.length }).select().single()
    if (error || !data) return
    setTeamFolders((prev) => [...prev, data as EditorTeamFolder])
  }, [currentUser.id, supabase, teamFolders.length])

  const renameFile = useCallback(async (fileId: string, title: string) => {
    await supabase.from('editor_files').update({ title }).eq('id', fileId)
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, title } : f)))
    setTeamFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, title } : f)))
    if (activeFile?.id === fileId) setActiveFile((prev) => prev ? { ...prev, title } : null)
  }, [activeFile, supabase])

  const deleteFile = useCallback(async (fileId: string) => {
    await supabase.from('editor_files').delete().eq('id', fileId)
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    setTeamFiles((prev) => prev.filter((f) => f.id !== fileId))
    if (activeFile?.id === fileId) { setActiveFile(null); setEditorContent('') }
  }, [activeFile, supabase])

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    await supabase.from('editor_folders').update({ name }).eq('id', folderId)
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
  }, [supabase])

  const renameTeamFolder = useCallback(async (folderId: string, name: string) => {
    await supabase.from('editor_team_folders').update({ name }).eq('id', folderId)
    setTeamFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
  }, [supabase])

  const deleteFolder = useCallback(async (folderId: string) => {
    await supabase.from('editor_files').update({ folder_id: null }).eq('folder_id', folderId)
    await supabase.from('editor_folders').delete().eq('id', folderId)
    setFiles((prev) => prev.map((f) => (f.folder_id === folderId ? { ...f, folder_id: null } : f)))
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
  }, [supabase])

  const deleteTeamFolder = useCallback(async (folderId: string) => {
    await supabase.from('editor_files').update({ team_folder_id: null }).eq('team_folder_id', folderId)
    await supabase.from('editor_team_folders').delete().eq('id', folderId)
    setFiles((prev) => prev.map((f) => (f.team_folder_id === folderId ? { ...f, team_folder_id: null } : f)))
    setTeamFiles((prev) => prev.map((f) => (f.team_folder_id === folderId ? { ...f, team_folder_id: null } : f)))
    setTeamFolders((prev) => prev.filter((f) => f.id !== folderId))
    setActiveFile((prev) => prev && prev.team_folder_id === folderId ? { ...prev, team_folder_id: null } : prev)
  }, [supabase])

  const moveFile = useCallback(async (fileId: string, folderId: string | null) => {
    const sourceFile = findFileAcrossLists(fileId)
    if (!sourceFile) return
    const updatedFile: EditorFile = { ...sourceFile, folder_id: folderId, team_folder_id: null, visibility: 'private' as FileVisibility }
    await supabase.from('editor_files').update({ folder_id: folderId, team_folder_id: null, visibility: 'private' as FileVisibility }).eq('id', fileId)
    placeInPrivateFiles(updatedFile)
  }, [findFileAcrossLists, placeInPrivateFiles, supabase])

  const moveFileToTeamFolder = useCallback(async (fileId: string, teamFolderId: string | null) => {
    const sourceFile = findFileAcrossLists(fileId)
    if (!sourceFile) return
    const updatedFile: EditorFile = { ...sourceFile, team_folder_id: teamFolderId, folder_id: null, visibility: 'team' as FileVisibility }
    await supabase.from('editor_files').update({ team_folder_id: teamFolderId, folder_id: null, visibility: 'team' as FileVisibility }).eq('id', fileId)
    placeInTeamFiles(updatedFile)
  }, [findFileAcrossLists, placeInTeamFiles, supabase])

  const changeLanguage = useCallback(async (lang: EditorLanguage) => {
    if (!activeFile) return
    await supabase.from('editor_files').update({ language: lang }).eq('id', activeFile.id)
    setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, language: lang } : f)))
    setTeamFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, language: lang } : f)))
    setActiveFile((prev) => prev ? { ...prev, language: lang } : null)
  }, [activeFile, supabase])

  const toggleVisibility = useCallback(async () => {
    if (!activeFile) return
    const newVis: FileVisibility = activeFile.visibility === 'private' ? 'team' : 'private'
    const updatedFile: EditorFile = { ...activeFile, visibility: newVis, team_folder_id: null }
    await supabase.from('editor_files').update({ visibility: newVis, team_folder_id: null }).eq('id', activeFile.id)
    if (newVis === 'team') placeInTeamFiles(updatedFile)
    else placeInPrivateFiles(updatedFile)
  }, [activeFile, placeInPrivateFiles, placeInTeamFiles, supabase])

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(editorContent)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [editorContent])

  const normalizeTag = useCallback((tag: string) => tag.trim().toLowerCase().slice(0, 20), [])

  const updateFileTags = useCallback(async (fileId: string, tags: string[]) => {
    const cleanedTags = Array.from(new Set(tags.map(normalizeTag).filter(Boolean)))
    const { error } = await supabase.from('editor_files').update({ tags: cleanedTags }).eq('id', fileId)
    if (error) return
    setFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, tags: cleanedTags } : file)))
    setTeamFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, tags: cleanedTags } : file)))
    setActiveFile((prev) => prev && prev.id === fileId ? { ...prev, tags: cleanedTags } : prev)
  }, [normalizeTag, supabase])

  const addTag = useCallback(async () => {
    if (!activeFile || activeFile.user_id !== currentUser.id) return
    const tag = normalizeTag(newTagValue)
    if (!tag) {
      setIsAddingTag(false)
      setNewTagValue('')
      return
    }
    const currentTags = Array.from(new Set((activeFile.tags ?? []).map(normalizeTag).filter(Boolean)))
    if (currentTags.includes(tag)) {
      setIsAddingTag(false)
      setNewTagValue('')
      return
    }
    await updateFileTags(activeFile.id, [...currentTags, tag])
    setIsAddingTag(false)
    setNewTagValue('')
  }, [activeFile, currentUser.id, newTagValue, normalizeTag, updateFileTags])

  const removeTag = useCallback(async (tagToRemove: string) => {
    if (!activeFile || activeFile.user_id !== currentUser.id) return
    const remaining = (activeFile.tags ?? []).filter((tag) => normalizeTag(tag) !== normalizeTag(tagToRemove))
    await updateFileTags(activeFile.id, remaining)
  }, [activeFile, currentUser.id, normalizeTag, updateFileTags])

  const startTitleRename = useCallback(() => {
    if (!activeFile || activeFile.user_id !== currentUser.id) return
    setTitleDraft(activeFile.title)
    setIsRenamingTitle(true)
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
  }, [activeFile, currentUser.id])

  const cancelTitleRename = useCallback(() => {
    setIsRenamingTitle(false)
    setTitleDraft('')
  }, [])

  const commitTitleRename = useCallback(async () => {
    if (!activeFile || activeFile.user_id !== currentUser.id) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle || nextTitle === activeFile.title) {
      cancelTitleRename()
      return
    }
    await renameFile(activeFile.id, nextTitle)
    cancelTitleRename()
  }, [activeFile, cancelTitleRename, currentUser.id, renameFile, titleDraft])

  const allFiles = useMemo<EditorFile[]>(() => {
    const fileMap = new Map<string, EditorFile>()
    ;[...files, ...teamFiles].forEach((file) => fileMap.set(file.id, file))
    return Array.from(fileMap.values())
  }, [files, teamFiles])

  const companionFiles = useMemo<PreviewCompanionFile[] | undefined>(() => {
    if (!activeFile) return undefined
    if (!activeFile.folder_id && !activeFile.team_folder_id) return undefined

    const relatedFiles = allFiles.filter((file) => {
      if (file.id === activeFile.id) return false
      if (activeFile.team_folder_id) return file.team_folder_id === activeFile.team_folder_id
      return file.folder_id === activeFile.folder_id
    })

    const companions = relatedFiles
      .filter((file) => file.language !== activeFile.language)
      .map((file) => ({ language: file.language, content: file.content }))

    return companions.length ? companions : undefined
  }, [activeFile, allFiles])

  const downloadContent = useCallback((filename: string, fileContent: string, mimeType: string) => {
    const blob = new Blob([fileContent], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  const downloadCurrentFile = useCallback(() => {
    if (!activeFile) return
    const extension = activeFile.language === 'html' ? 'html' : activeFile.language === 'css' ? 'css' : 'js'
    const mimeType = activeFile.language === 'html' ? 'text/html;charset=utf-8' : activeFile.language === 'css' ? 'text/css;charset=utf-8' : 'text/javascript;charset=utf-8'
    downloadContent(`${activeFile.title}.${extension}`, editorContent, mimeType)
  }, [activeFile, downloadContent, editorContent])

  const downloadComposedFile = useCallback(() => {
    if (!activeFile || activeFile.language !== 'html' || !companionFiles?.length) return
    const composedHtml = composeDocument({ content: editorContent, language: 'html', companionFiles })
    downloadContent(`${activeFile.title}-composed.html`, composedHtml, 'text/html;charset=utf-8')
  }, [activeFile, companionFiles, downloadContent, editorContent])

  const handleSplitDragStart = useCallback(() => {
    setIsDraggingSplit(true)
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const handleMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitRatio(Math.max(25, Math.min(75, pct)))
    }
    const handleUp = () => {
      isDraggingRef.current = false
      setIsDraggingSplit(false)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp)
  }, [])

  const handleSidebarDragStart = useCallback(() => {
    isDraggingSidebarRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const handleMove = (e: MouseEvent) => { if (!isDraggingSidebarRef.current) return; setSidebarWidth(Math.max(180, Math.min(400, e.clientX))) }
    const handleUp = () => {
      isDraggingSidebarRef.current = false
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp)
  }, [])

  const saveStatusDisplay = {
    saved: { text: 'Saved', color: 'text-emerald-400', dot: 'bg-emerald-400' },
    unsaved: { text: 'Unsaved', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
    saving: { text: 'Saving...', color: 'text-brand-400', dot: 'bg-brand-400 animate-pulse' },
    error: { text: 'Save failed', color: 'text-red-400', dot: 'bg-red-400' },
  }
  const status = saveStatusDisplay[saveStatus]
  const showComposedDownload = activeFile?.language === 'html' && Boolean(companionFiles?.length)

  return (
    <div className="flex h-screen overflow-hidden -m-8">
      <div style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <FileSidebar files={files} folders={folders} teamFiles={teamFiles} teamFolders={teamFolders} activeFileId={activeFile?.id ?? null} currentUserId={currentUser.id} profiles={profiles}
          onSelectFile={selectFile} onCreateFile={createFile} onCreateFolder={createFolder} onRenameFile={renameFile} onDeleteFile={deleteFile}
          onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onMoveFile={moveFile}
          onCreateTeamFolder={createTeamFolder} onRenameTeamFolder={renameTeamFolder} onDeleteTeamFolder={deleteTeamFolder} onMoveFileToTeamFolder={moveFileToTeamFolder} />
      </div>
      <div onMouseDown={handleSidebarDragStart} className="group flex w-1 cursor-col-resize items-center justify-center hover:bg-brand-700/30">
        <div className="h-8 w-0.5 rounded-full bg-brand-700 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeFile ? (
          <>
            <div className="relative flex flex-wrap items-center gap-2 border-b border-brand-800 bg-brand-950/90 px-4 py-2 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-3">
                <select value={activeFile.language} onChange={(e) => changeLanguage(e.target.value as EditorLanguage)}
                  className="rounded-md border border-brand-700 bg-brand-900 px-2 py-1 text-xs text-white outline-none focus:border-brand-500">
                  <option value="html">HTML</option><option value="css">CSS</option><option value="javascript">JavaScript</option>
                </select>
                {activeFile.user_id === currentUser.id ? (
                  isRenamingTitle ? (
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={commitTitleRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void commitTitleRename() }
                        if (e.key === 'Escape') { e.preventDefault(); cancelTitleRename() }
                      }}
                      className="min-w-0 border-b border-brand-500 bg-transparent text-sm font-medium text-white outline-none"
                    />
                  ) : (
                    <button onClick={startTitleRename} className="truncate text-left text-sm font-medium text-white hover:text-brand-200" title="Rename file">
                      {activeFile.title}
                    </button>
                  )
                ) : (
                  <span className="text-sm font-medium text-white">{activeFile.title}</span>
                )}
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  <span className={`text-[11px] ${status.color}`}>{status.text}</span>
                </div>
              </div>
              {activeFile.user_id === currentUser.id && (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {(activeFile.tags ?? []).map((tag, index) => (
                    <span key={`${activeFile.id}-tag-${index}`} className="rounded-full border border-brand-700/50 bg-brand-800/60 px-2 py-0.5 text-[10px] text-brand-300">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-1 text-brand-500 hover:text-red-400" title={`Remove ${tag}`} aria-label={`Remove ${tag}`}>
                        x
                      </button>
                    </span>
                  ))}
                  {isAddingTag ? (
                    <input
                      autoFocus
                      value={newTagValue}
                      onChange={(e) => setNewTagValue(e.target.value)}
                      onBlur={() => { setIsAddingTag(false); setNewTagValue('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addTag() }
                        if (e.key === 'Escape') { e.preventDefault(); setIsAddingTag(false); setNewTagValue('') }
                      }}
                      maxLength={20}
                      placeholder="tag"
                      className="w-24 rounded-full border border-brand-700 bg-brand-900 px-2 py-0.5 text-[10px] text-brand-200 outline-none focus:border-brand-500"
                    />
                  ) : (
                    <button onClick={() => setIsAddingTag(true)} className="rounded-full border border-dashed border-brand-700 px-2 py-0.5 text-[10px] text-brand-500 transition-colors hover:text-brand-300" title="Add tag">
                      +
                    </button>
                  )}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <AiPrompt language={activeFile.language} currentCode={editorContent} onGenerated={(code) => setEditorContent(code)} />
                {activeFile.user_id === currentUser.id && (
                  <button onClick={toggleVisibility} className={`rounded-md border px-2 py-1 text-xs transition-colors ${activeFile.visibility === 'team' ? 'border-brand-600 bg-brand-800 text-brand-200' : 'border-brand-700 bg-brand-900 text-brand-400 hover:text-brand-200'}`}
                    title={activeFile.visibility === 'team' ? 'Visible to team' : 'Private'}>
                    {activeFile.visibility === 'team' ? '👥 Team' : '🔒 Private'}
                  </button>
                )}
                <button onClick={loadVersionHistory} className="rounded-md border border-brand-700 bg-brand-900 px-2 py-1 text-xs text-brand-300 transition-colors hover:bg-brand-800 hover:text-white" title="Version History">
                  <HistoryIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setShowPreview(!showPreview)} className={`rounded-md border px-2 py-1 text-xs transition-colors ${showPreview ? 'border-brand-600 bg-brand-800 text-white' : 'border-brand-700 bg-brand-900 text-brand-400 hover:text-white'}`} title="Toggle Preview">
                  <span className="flex items-center gap-1">
                    <PreviewIcon className="h-3.5 w-3.5" />
                    Preview
                  </span>
                </button>
                <button onClick={manualSave} className="rounded-md border border-brand-700 bg-brand-900 px-2.5 py-1 text-xs text-brand-300 transition-colors hover:bg-brand-800 hover:text-white" title="Save version (Cmd+S)">Save</button>
                <button onClick={downloadCurrentFile} className="rounded-md border border-brand-700 bg-brand-900 px-2 py-1 text-xs text-brand-300 transition-colors hover:bg-brand-800 hover:text-white" title="Download file">
                  <DownloadIcon className="h-3.5 w-3.5" />
                </button>
                {showComposedDownload && (
                  <button onClick={downloadComposedFile} className="rounded-md border border-brand-700 bg-brand-900 px-2 py-1 text-xs text-brand-300 transition-colors hover:bg-brand-800 hover:text-white" title="Download with CSS/JS from folder">
                    <span className="flex items-center gap-1">
                      <DownloadIcon className="h-3.5 w-3.5" />
                      Composed
                    </span>
                  </button>
                )}
                <button onClick={copyToClipboard} className={`relative rounded-md px-3 py-1 text-xs font-medium transition-all ${copyFeedback ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-gold-400 text-white hover:bg-gold-500 border border-gold-400'}`}>
                  {copyFeedback ? (<span className="flex items-center gap-1"><CheckIcon className="h-3 w-3" /> Copied</span>) : (<span className="flex items-center gap-1"><ClipboardIcon className="h-3 w-3" /> Copy</span>)}
                </button>
              </div>
            </div>
            <div ref={containerRef} className="flex flex-1 overflow-hidden">
              <div style={{ width: showPreview ? `${splitRatio}%` : '100%' }} className={`h-full overflow-hidden ${isDraggingSplit ? 'pointer-events-none' : ''}`}>
                <CodeEditor value={editorContent} language={activeFile.language} onChange={setEditorContent} onSave={manualSave} readOnly={activeFile.user_id !== currentUser.id} />
              </div>
              {showPreview && (
                <div onMouseDown={handleSplitDragStart} className="group flex w-1.5 cursor-col-resize items-center justify-center bg-brand-950 hover:bg-brand-800/50">
                  <div className="h-12 w-0.5 rounded-full bg-brand-700 transition-colors group-hover:bg-brand-500" />
                </div>
              )}
              {showPreview && (
                <div style={{ width: `${100 - splitRatio}%` }} className={`h-full overflow-hidden ${isDraggingSplit ? 'pointer-events-none' : ''}`}>
                  <LivePreview content={editorContent} language={activeFile.language} companionFiles={companionFiles} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-brand-800 bg-brand-950/90 px-4 py-1 text-[11px] text-brand-500">
              <div className="flex items-center gap-4">
                <span>{activeFile.language.toUpperCase()}</span>
                <span>{editorContent.length.toLocaleString()} chars</span>
                <span>{editorContent.split('\n').length} lines</span>
              </div>
              <div className="flex items-center gap-4"><span>Tab: 2 spaces</span><span>UTF-8</span></div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-brand-800 bg-brand-900/50">
                <CodeBracketIcon className="h-10 w-10 text-brand-600" />
              </div>
              <h2 className="text-lg font-semibold text-white">No file open</h2>
              <p className="mt-1 text-sm text-brand-400">Select a file from the sidebar or create a new one.</p>
              <button onClick={() => createFile(null)} className="mt-4 rounded-lg bg-gold-400 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-500">+ New File</button>
            </div>
          </div>
        )}
      </div>
      {showHistory && (
        <div className="w-72 border-l border-brand-800 bg-brand-950/90">
          <div className="flex items-center justify-between border-b border-brand-800 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">Version History</span>
            <button onClick={() => setShowHistory(false)} className="text-brand-500 hover:text-white"><CloseIcon className="h-4 w-4" /></button>
          </div>
          <div className="overflow-y-auto p-2">
            {versionHistory.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-brand-500">No versions yet. Press Cmd+S to save a version.</p>
            ) : (versionHistory.map((v) => (
              <button key={v.id} onClick={() => restoreVersion(v)} className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-800/50">
                <span className="text-xs text-white">{new Date(v.created_at).toLocaleDateString()} {new Date(v.created_at).toLocaleTimeString()}</span>
                <span className="text-[10px] text-brand-500">{v.content.length.toLocaleString()} chars{(v as unknown as { creator?: { full_name: string } }).creator?.full_name && ` · ${(v as unknown as { creator: { full_name: string } }).creator.full_name}`}</span>
              </button>
            )))}
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)
}
function PreviewIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>)
}
function CheckIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>)
}
function ClipboardIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>)
}
function DownloadIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 15.75v2.25a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25v-2.25M12 3v12m0 0l-3.75-3.75M12 15l3.75-3.75" /></svg>)
}
function CodeBracketIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>)
}
function CloseIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>)
}
