'use client'

import { useState, useMemo } from 'react'
import type { EditorFile, EditorFolder, EditorTeamFolder, EditorLanguage, Profile } from '@/lib/types/database'

interface FileSidebarProps {
  files: EditorFile[]
  folders: EditorFolder[]
  teamFiles: EditorFile[]
  teamFolders: EditorTeamFolder[]
  activeFileId: string | null
  currentUserId: string
  profiles: Profile[]
  onSelectFile: (file: EditorFile) => void
  onCreateFile: (folderId: string | null) => void
  onCreateFolder: (name: string) => void
  onCreateTeamFolder: (name: string) => void
  onRenameFile: (fileId: string, title: string) => void
  onDeleteFile: (fileId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onDeleteFolder: (folderId: string) => void
  onRenameTeamFolder: (folderId: string, name: string) => void
  onDeleteTeamFolder: (folderId: string) => void
  onMoveFile: (fileId: string, folderId: string | null) => void
  onMoveFileToTeamFolder: (fileId: string, teamFolderId: string | null) => void
}

type ContextMenuType = 'file' | 'folder' | 'team-file' | 'team-folder'
type RenameType = 'file' | 'folder' | 'team-folder'

const LANG_ICONS: Record<EditorLanguage, { color: string; label: string }> = {
  html: { color: 'text-nex-red', label: 'HTML' },
  css: { color: 'text-brand-400', label: 'CSS' },
  javascript: { color: 'text-nex-gold', label: 'JS' },
}

export function FileSidebar({
  files, folders, teamFiles, teamFolders, activeFileId, currentUserId, profiles,
  onSelectFile, onCreateFile, onCreateFolder, onCreateTeamFolder, onRenameFile, onDeleteFile,
  onRenameFolder, onDeleteFolder, onRenameTeamFolder, onDeleteTeamFolder, onMoveFile, onMoveFileToTeamFolder,
}: FileSidebarProps) {
  const [search, setSearch] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['unfiled', 'team-unfiled']))
  const [showTeamFiles, setShowTeamFiles] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newTeamFolderName, setNewTeamFolderName] = useState('')
  const [isCreatingTeamFolder, setIsCreatingTeamFolder] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; type: ContextMenuType; x: number; y: number } | null>(null)

  const searchQuery = search.trim().toLowerCase()
  const isSearching = Boolean(searchQuery)

  const filesByFolder = useMemo(() => {
    const map: Record<string, EditorFile[]> = { unfiled: [] }
    folders.forEach((f) => (map[f.id] = []))
    files.forEach((f) => {
      const key = f.folder_id ?? 'unfiled'
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    )
    return map
  }, [files, folders])

  const teamFolderNameById = useMemo(() => {
    const map: Record<string, string> = {}
    teamFolders.forEach((folder) => { map[folder.id] = folder.name })
    return map
  }, [teamFolders])

  const filteredPersonalFiles = useMemo(() => {
    if (!isSearching) return files
    return files.filter(
      (file) =>
        file.title.toLowerCase().includes(searchQuery) ||
        file.tags.some((tag) => tag.toLowerCase().includes(searchQuery)) ||
        file.language.toLowerCase().includes(searchQuery)
    )
  }, [files, isSearching, searchQuery])

  const filteredTeamFiles = useMemo(() => {
    if (!isSearching) return teamFiles
    return teamFiles.filter((file) => {
      const folderName = file.team_folder_id ? (teamFolderNameById[file.team_folder_id] ?? '') : ''
      return (
        file.title.toLowerCase().includes(searchQuery) ||
        file.tags.some((tag) => tag.toLowerCase().includes(searchQuery)) ||
        file.language.toLowerCase().includes(searchQuery) ||
        folderName.toLowerCase().includes(searchQuery)
      )
    })
  }, [isSearching, searchQuery, teamFiles, teamFolderNameById])

  const visibleTeamFolders = useMemo(() => {
    if (!isSearching) return teamFolders
    return teamFolders.filter(
      (folder) =>
        folder.name.toLowerCase().includes(searchQuery) ||
        filteredTeamFiles.some((file) => file.team_folder_id === folder.id)
    )
  }, [filteredTeamFiles, isSearching, searchQuery, teamFolders])

  const teamFilesByFolder = useMemo(() => {
    const map: Record<string, EditorFile[]> = { unfiled: [] }
    visibleTeamFolders.forEach((folder) => { map[folder.id] = [] })
    filteredTeamFiles.forEach((file) => {
      const key = file.team_folder_id ?? 'unfiled'
      if (!map[key]) map[key] = []
      map[key].push(file)
    })
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    )
    return map
  }, [filteredTeamFiles, visibleTeamFolders])

  const isTeamSectionOpen = showTeamFiles || isSearching

  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleContextMenu(e: React.MouseEvent, id: string, type: ContextMenuType) {
    e.preventDefault()
    setContextMenu({ id, type, x: e.clientX, y: e.clientY })
  }

  function startRename(id: string, currentName: string, type: RenameType) {
    setEditingId(`${type}:${id}`)
    setEditingValue(currentName)
    setContextMenu(null)
  }

  function commitRename(id: string, type: RenameType) {
    if (editingValue.trim()) {
      if (type === 'file') onRenameFile(id, editingValue.trim())
      else if (type === 'folder') onRenameFolder(id, editingValue.trim())
      else onRenameTeamFolder(id, editingValue.trim())
    }
    setEditingId(null)
    setEditingValue('')
  }

  function getOwnerName(userId: string): string {
    if (userId === currentUserId) return 'You'
    const p = profiles.find((pr) => pr.id === userId)
    return p?.full_name?.split(' ')[0] ?? 'Unknown'
  }

  function timeAgo(dateString: string): string {
    const diffMs = Date.now() - new Date(dateString).getTime()
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now'
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    const weeks = Math.floor(days / 7)
    return `${weeks}w ago`
  }

  function renderFileItem(file: EditorFile, isTeam = false) {
    const isActive = file.id === activeFileId
    const langInfo = LANG_ICONS[file.language]
    const isEditing = !isTeam && editingId === `file:${file.id}`
    const visibleTags = file.tags.slice(0, 3)
    const extraTagCount = file.tags.length - visibleTags.length

    return (
      <button
        key={file.id}
        onClick={() => onSelectFile(file)}
        onContextMenu={(e) => handleContextMenu(e, file.id, isTeam ? 'team-file' : 'file')}
        className={`group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all duration-150 ${
          isActive
            ? 'bg-brand-800/80 text-white shadow-[inset_2px_0_0_0_#C8102E]'
            : 'text-brand-200 hover:bg-brand-800/40 hover:text-white'
        }`}
      >
        <span className={`flex-shrink-0 font-mono text-[10px] font-bold ${langInfo.color}`}>{langInfo.label}</span>
        {isEditing ? (
          <input
            autoFocus
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitRename(file.id, 'file')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(file.id, 'file')
              if (e.key === 'Escape') setEditingId(null)
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="min-w-0 flex flex-1 flex-col">
            <div className="truncate">{file.title}</div>
            {isTeam && (
              <div className="text-[10px] text-brand-500">
                {getOwnerName(file.user_id)} · {timeAgo(file.updated_at)}
              </div>
            )}
          </div>
        )}
        <span className="ml-1 flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
          {file.visibility === 'team' && (
            <span className="text-[10px] text-brand-500" title="Visible to team"><TeamIcon className="h-3 w-3" /></span>
          )}
          {file.is_template && (
            <span className="rounded bg-brand-800 px-1 py-0.5 text-[9px] font-medium text-brand-500">TPL</span>
          )}
          {visibleTags.map((tag, index) => (
            <span key={`${file.id}-tag-${index}`} className="max-w-[88px] truncate rounded-full bg-brand-800 px-1.5 py-0.5 text-[9px] text-brand-400" title={tag}>
              {tag.length > 12 ? `${tag.slice(0, 12)}...` : tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="rounded-full bg-brand-800 px-1.5 py-0.5 text-[9px] text-brand-400">+{extraTagCount}</span>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col border-r border-brand-800 bg-brand-950/80">
      <div className="flex items-center justify-between border-b border-brand-800 px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">Files</span>
        <button onClick={() => onCreateFile(null)} className="rounded-md bg-nex-red/90 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-nex-red" title="New file">+ New</button>
      </div>

      <div className="border-b border-brand-800/50 px-3 py-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-brand-800 bg-brand-900/50 py-1.5 pl-7 pr-2 text-xs text-white placeholder-brand-600 outline-none transition-colors focus:border-brand-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isSearching ? (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-brand-500">
              {filteredPersonalFiles.length} personal result{filteredPersonalFiles.length !== 1 ? 's' : ''}
            </p>
            {filteredPersonalFiles.length === 0 ? (
              <p className="px-2 py-1 text-[10px] italic text-brand-600">No personal files found</p>
            ) : (
              filteredPersonalFiles.map((file) => renderFileItem(file))
            )}
          </div>
        ) : (
          <>
            {folders.map((folder) => {
              const folderFiles = filesByFolder[folder.id] ?? []
              const isExpanded = expandedFolders.has(folder.id)
              const isFolderEditing = editingId === `folder:${folder.id}`
              return (
                <div key={folder.id} className="mb-1">
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    onContextMenu={(e) => handleContextMenu(e, folder.id, 'folder')}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-800/30 hover:text-white"
                  >
                    <ChevronIcon className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                    <FolderIcon className="h-3.5 w-3.5 text-brand-500" />
                    {isFolderEditing ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => commitRename(folder.id, 'folder')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(folder.id, 'folder')
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate text-left">{folder.name}</span>
                    )}
                    <span className="text-[10px] text-brand-600">{folderFiles.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 space-y-0.5 border-l border-brand-800/40 pl-2">
                      {folderFiles.map((file) => renderFileItem(file))}
                      {folderFiles.length === 0 && <p className="px-2 py-1 text-[10px] italic text-brand-600">Empty folder</p>}
                    </div>
                  )}
                </div>
              )
            })}

            {(filesByFolder['unfiled']?.length ?? 0) > 0 && (
              <div className="mb-1">
                <button
                  onClick={() => toggleFolder('unfiled')}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-800/30 hover:text-white"
                >
                  <ChevronIcon className={`h-3 w-3 transition-transform duration-150 ${expandedFolders.has('unfiled') ? 'rotate-90' : ''}`} />
                  <FolderIcon className="h-3.5 w-3.5 text-brand-600" />
                  <span className="flex-1 text-left">Unfiled</span>
                  <span className="text-[10px] text-brand-600">{filesByFolder['unfiled']?.length ?? 0}</span>
                </button>
                {expandedFolders.has('unfiled') && (
                  <div className="ml-3 space-y-0.5 border-l border-brand-800/40 pl-2">
                    {filesByFolder['unfiled'].map((file) => renderFileItem(file))}
                  </div>
                )}
              </div>
            )}

            {isCreatingFolder ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <FolderIcon className="h-3.5 w-3.5 text-brand-500" />
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name..."
                  onBlur={() => {
                    if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
                    setIsCreatingFolder(false)
                    setNewFolderName('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) {
                      onCreateFolder(newFolderName.trim())
                      setIsCreatingFolder(false)
                      setNewFolderName('')
                    }
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false)
                      setNewFolderName('')
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-brand-600 outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-brand-500 transition-colors hover:bg-brand-800/30 hover:text-brand-300"
              >
                <PlusSmallIcon className="h-3 w-3" /> New Folder
              </button>
            )}
          </>
        )}

        <div className="mt-4 border-t border-brand-800/50 pt-3">
          <button
            onClick={() => setShowTeamFiles(!showTeamFiles)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-800/30 hover:text-white"
          >
            <ChevronIcon className={`h-3 w-3 transition-transform duration-150 ${isTeamSectionOpen ? 'rotate-90' : ''}`} />
            <TeamIcon className="h-3.5 w-3.5 text-brand-500" />
            <span className="flex-1 text-left">Team Files</span>
            <span className="text-[10px] text-brand-600">{filteredTeamFiles.length}</span>
          </button>

          {isTeamSectionOpen && (
            <div className="ml-3 space-y-1 border-l border-brand-800/40 pl-2">
              {(teamFilesByFolder['unfiled']?.length ?? 0) > 0 && (
                <div className="pt-1">
                  <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-brand-600">Unfiled</p>
                  <div className="space-y-0.5">
                    {teamFilesByFolder['unfiled'].map((file) => renderFileItem(file, true))}
                  </div>
                </div>
              )}

              {visibleTeamFolders.map((folder) => {
                const folderFiles = teamFilesByFolder[folder.id] ?? []
                const expandKey = `team-folder:${folder.id}`
                const isExpanded = expandedFolders.has(expandKey)
                const isFolderEditing = editingId === `team-folder:${folder.id}`
                return (
                  <div key={folder.id} className="mb-1">
                    <button
                      onClick={() => toggleFolder(expandKey)}
                      onContextMenu={(e) => handleContextMenu(e, folder.id, 'team-folder')}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-800/30 hover:text-white"
                    >
                      <ChevronIcon className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                      <TeamIcon className="h-3.5 w-3.5 text-brand-500" />
                      {isFolderEditing ? (
                        <input
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => commitRename(folder.id, 'team-folder')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(folder.id, 'team-folder')
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate text-left">{folder.name}</span>
                      )}
                      <span className="text-[10px] text-brand-600">{folderFiles.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 space-y-0.5 border-l border-brand-800/40 pl-2">
                        {folderFiles.map((file) => renderFileItem(file, true))}
                        {folderFiles.length === 0 && <p className="px-2 py-1 text-[10px] italic text-brand-600">Empty team folder</p>}
                      </div>
                    )}
                  </div>
                )
              })}

              {filteredTeamFiles.length === 0 && visibleTeamFolders.length === 0 && (
                <p className="px-2 py-1 text-[10px] italic text-brand-600">No shared files yet</p>
              )}

              {isCreatingTeamFolder ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <TeamIcon className="h-3.5 w-3.5 text-brand-500" />
                  <input
                    autoFocus
                    value={newTeamFolderName}
                    onChange={(e) => setNewTeamFolderName(e.target.value)}
                    placeholder="Team folder name..."
                    onBlur={() => {
                      if (newTeamFolderName.trim()) onCreateTeamFolder(newTeamFolderName.trim())
                      setIsCreatingTeamFolder(false)
                      setNewTeamFolderName('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTeamFolderName.trim()) {
                        onCreateTeamFolder(newTeamFolderName.trim())
                        setIsCreatingTeamFolder(false)
                        setNewTeamFolderName('')
                      }
                      if (e.key === 'Escape') {
                        setIsCreatingTeamFolder(false)
                        setNewTeamFolderName('')
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-brand-600 outline-none"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingTeamFolder(true)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-brand-500 transition-colors hover:bg-brand-800/30 hover:text-brand-300"
                >
                  <PlusSmallIcon className="h-3 w-3" /> New Team Folder
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-brand-800/50 pt-3">
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 opacity-40">
            <TemplateIcon className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs text-brand-500">Templates</span>
            <span className="ml-auto rounded bg-brand-800 px-1.5 py-0.5 text-[9px] font-medium text-brand-500">Coming Soon</span>
          </div>
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 min-w-[140px] rounded-lg border border-brand-700 bg-brand-900 py-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {(contextMenu.type === 'file' || contextMenu.type === 'folder' || contextMenu.type === 'team-folder') && (
              <button
                onClick={() => {
                  if (contextMenu.type === 'file') {
                    const item = files.find((f) => f.id === contextMenu.id)
                    if (item) startRename(contextMenu.id, item.title, 'file')
                  } else if (contextMenu.type === 'folder') {
                    const item = folders.find((f) => f.id === contextMenu.id)
                    if (item) startRename(contextMenu.id, item.name, 'folder')
                  } else {
                    const item = teamFolders.find((f) => f.id === contextMenu.id)
                    if (item) startRename(contextMenu.id, item.name, 'team-folder')
                  }
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-800 hover:text-white"
              >
                Rename
              </button>
            )}

            {contextMenu.type === 'file' && (
              <div className="border-t border-brand-800 py-1">
                <p className="px-3 py-1 text-[10px] font-medium uppercase text-brand-500">Move to</p>
                <button
                  onClick={() => { onMoveFile(contextMenu.id, null); setContextMenu(null) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-800 hover:text-white"
                >
                  Unfiled
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { onMoveFile(contextMenu.id, folder.id); setContextMenu(null) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-800 hover:text-white"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}

            {contextMenu.type === 'team-file' && (
              <div className="border-t border-brand-800 py-1">
                <p className="px-3 py-1 text-[10px] font-medium uppercase text-brand-500">Move to</p>
                <button
                  onClick={() => { onMoveFileToTeamFolder(contextMenu.id, null); setContextMenu(null) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-800 hover:text-white"
                >
                  Unfiled
                </button>
                {teamFolders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { onMoveFileToTeamFolder(contextMenu.id, folder.id); setContextMenu(null) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-800 hover:text-white"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}

            {(contextMenu.type === 'file' || contextMenu.type === 'folder' || contextMenu.type === 'team-folder') && (
              <div className="border-t border-brand-800">
                <button
                  onClick={() => {
                    if (contextMenu.type === 'file') onDeleteFile(contextMenu.id)
                    else if (contextMenu.type === 'folder') onDeleteFolder(contextMenu.id)
                    else onDeleteTeamFolder(contextMenu.id)
                    setContextMenu(null)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>)
}
function ChevronIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>)
}
function FolderIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>)
}
function TeamIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>)
}
function TemplateIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>)
}
function PlusSmallIcon({ className }: { className?: string }) {
  return (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" /></svg>)
}
