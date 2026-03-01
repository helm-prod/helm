'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { HelmCarousel, HelmCarouselItem, Profile } from '@/lib/types/database'

interface CarouselManagerProps {
  currentUser: Profile
  initialCarousels: HelmCarousel[]
  initialItems: HelmCarouselItem[]
}

type PageGroup = {
  pageSlug: string
  count: number
  latestUpdatedAt: string | null
}

function sortCarousels(a: HelmCarousel, b: HelmCarousel) {
  if (a.page_slug !== b.page_slug) {
    return a.page_slug.localeCompare(b.page_slug)
  }
  return a.sort_order - b.sort_order
}

function slugifyPageSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function makeTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function CarouselManager({ currentUser, initialCarousels, initialItems }: CarouselManagerProps) {
  const supabase = useMemo(() => createClient(), [])

  const [carousels, setCarousels] = useState<HelmCarousel[]>(() => [...initialCarousels].sort(sortCarousels))
  const [items, setItems] = useState<HelmCarouselItem[]>(() => [...initialItems].sort((a, b) => a.sort_order - b.sort_order))
  const [selectedPage, setSelectedPage] = useState<string | null>(() => {
    const pageSlugs = Array.from(new Set(initialCarousels.map((carousel) => carousel.page_slug))).sort((a, b) => a.localeCompare(b))
    return pageSlugs[0] ?? null
  })
  const [expandedCarousels, setExpandedCarousels] = useState<Set<string>>(new Set())
  const [isCreatingPage, setIsCreatingPage] = useState(false)
  const [newPageValue, setNewPageValue] = useState('')
  const [editingCarouselId, setEditingCarouselId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [draggingCarouselId, setDraggingCarouselId] = useState<string | null>(null)
  const [dragOverCarouselId, setDragOverCarouselId] = useState<string | null>(null)
  const [copiedPageSlug, setCopiedPageSlug] = useState<string | null>(null)

  const pageGroups = useMemo<PageGroup[]>(() => {
    const pageMap = new Map<string, PageGroup>()

    for (const carousel of carousels) {
      const existing = pageMap.get(carousel.page_slug)
      if (!existing) {
        pageMap.set(carousel.page_slug, {
          pageSlug: carousel.page_slug,
          count: 1,
          latestUpdatedAt: carousel.updated_at,
        })
        continue
      }

      existing.count += 1
      if (!existing.latestUpdatedAt) {
        existing.latestUpdatedAt = carousel.updated_at
      } else {
        const currentLatest = new Date(existing.latestUpdatedAt).getTime()
        const nextUpdated = new Date(carousel.updated_at).getTime()
        if (Number.isFinite(nextUpdated) && nextUpdated > currentLatest) {
          existing.latestUpdatedAt = carousel.updated_at
        }
      }
    }

    return Array.from(pageMap.values()).sort((a, b) => a.pageSlug.localeCompare(b.pageSlug))
  }, [carousels])

  const selectedCarousels = useMemo(() => {
    if (!selectedPage) return []
    return carousels
      .filter((carousel) => carousel.page_slug === selectedPage)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [carousels, selectedPage])

  const itemsByCarousel = useMemo(() => {
    const grouped = new Map<string, HelmCarouselItem[]>()

    for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
      const list = grouped.get(item.carousel_id)
      if (list) {
        list.push(item)
      } else {
        grouped.set(item.carousel_id, [item])
      }
    }

    return grouped
  }, [items])

  useEffect(() => {
    if (pageGroups.length === 0) {
      if (selectedPage !== null) {
        setSelectedPage(null)
      }
      return
    }

    if (!selectedPage || !pageGroups.some((group) => group.pageSlug === selectedPage)) {
      setSelectedPage(pageGroups[0].pageSlug)
    }
  }, [pageGroups, selectedPage])

  function toggleExpanded(carouselId: string) {
    setExpandedCarousels((prev) => {
      const next = new Set(prev)
      if (next.has(carouselId)) {
        next.delete(carouselId)
      } else {
        next.add(carouselId)
      }
      return next
    })
  }

  async function handleCopySnippet(pageSlug: string) {
    const snippet = `<div id="helm-carousels" data-page="${pageSlug}"></div>\n<script src="https://helm.nexweb.dev/embed/carousel.js"></script>`

    try {
      await navigator.clipboard.writeText(snippet)
      setCopiedPageSlug(pageSlug)
      window.setTimeout(() => setCopiedPageSlug((current) => (current === pageSlug ? null : current)), 1800)
    } catch (error) {
      console.error('Failed to copy embed snippet:', error)
    }
  }

  async function createPageGroup() {
    const slug = slugifyPageSlug(newPageValue)
    if (!slug) return

    const existingPage = pageGroups.find((group) => group.pageSlug === slug)
    if (existingPage) {
      setSelectedPage(existingPage.pageSlug)
      setIsCreatingPage(false)
      setNewPageValue('')
      return
    }

    const now = new Date().toISOString()
    const tempId = makeTempId()
    const optimisticCarousel: HelmCarousel = {
      id: tempId,
      page_slug: slug,
      title: 'New Carousel',
      sort_order: 0,
      is_active: true,
      created_by: currentUser.id,
      created_at: now,
      updated_at: now,
    }

    setCarousels((prev) => [...prev, optimisticCarousel].sort(sortCarousels))
    setSelectedPage(slug)
    setIsCreatingPage(false)
    setNewPageValue('')

    const { data, error } = await supabase
      .from('helm_carousels')
      .insert({
        page_slug: slug,
        title: 'New Carousel',
        sort_order: 0,
        is_active: true,
        created_by: currentUser.id,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('Failed to create page group:', error)
      setCarousels((prev) => prev.filter((carousel) => carousel.id !== tempId))
      return
    }

    setCarousels((prev) => prev.map((carousel) => (carousel.id === tempId ? (data as HelmCarousel) : carousel)).sort(sortCarousels))
  }

  async function createCarousel() {
    if (!selectedPage) return

    const maxSortOrder = selectedCarousels.length > 0
      ? Math.max(...selectedCarousels.map((carousel) => carousel.sort_order))
      : -1
    const nextSortOrder = maxSortOrder + 1

    const now = new Date().toISOString()
    const tempId = makeTempId()
    const optimisticCarousel: HelmCarousel = {
      id: tempId,
      page_slug: selectedPage,
      title: 'New Carousel',
      sort_order: nextSortOrder,
      is_active: true,
      created_by: currentUser.id,
      created_at: now,
      updated_at: now,
    }

    setCarousels((prev) => [...prev, optimisticCarousel].sort(sortCarousels))

    const { data, error } = await supabase
      .from('helm_carousels')
      .insert({
        page_slug: selectedPage,
        title: 'New Carousel',
        sort_order: nextSortOrder,
        is_active: true,
        created_by: currentUser.id,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('Failed to create carousel:', error)
      setCarousels((prev) => prev.filter((carousel) => carousel.id !== tempId))
      return
    }

    setCarousels((prev) => prev.map((carousel) => (carousel.id === tempId ? (data as HelmCarousel) : carousel)).sort(sortCarousels))
  }

  function beginTitleEdit(carousel: HelmCarousel) {
    setEditingCarouselId(carousel.id)
    setEditingTitle(carousel.title)
  }

  function cancelTitleEdit() {
    setEditingCarouselId(null)
    setEditingTitle('')
  }

  async function saveCarouselTitle(carousel: HelmCarousel, nextTitle: string) {
    const trimmed = nextTitle.trim()
    if (!trimmed) {
      cancelTitleEdit()
      return
    }

    if (trimmed === carousel.title) {
      cancelTitleEdit()
      return
    }

    const now = new Date().toISOString()
    const originalTitle = carousel.title

    setCarousels((prev) => prev.map((entry) => entry.id === carousel.id ? { ...entry, title: trimmed, updated_at: now } : entry))
    cancelTitleEdit()

    const { error } = await supabase
      .from('helm_carousels')
      .update({ title: trimmed })
      .eq('id', carousel.id)

    if (error) {
      console.error('Failed to rename carousel:', error)
      setCarousels((prev) => prev.map((entry) => entry.id === carousel.id ? { ...entry, title: originalTitle } : entry))
    }
  }

  async function toggleCarouselActive(carousel: HelmCarousel) {
    const nextValue = !carousel.is_active
    const now = new Date().toISOString()

    setCarousels((prev) => prev.map((entry) => entry.id === carousel.id ? { ...entry, is_active: nextValue, updated_at: now } : entry))

    const { error } = await supabase
      .from('helm_carousels')
      .update({ is_active: nextValue })
      .eq('id', carousel.id)

    if (error) {
      console.error('Failed to toggle carousel status:', error)
      setCarousels((prev) => prev.map((entry) => entry.id === carousel.id ? { ...entry, is_active: carousel.is_active } : entry))
    }
  }

  async function confirmDeleteCarousel(carouselId: string) {
    const carouselToDelete = carousels.find((carousel) => carousel.id === carouselId)
    if (!carouselToDelete) {
      setDeleteConfirmId(null)
      return
    }

    const removedItems = items.filter((item) => item.carousel_id === carouselId)

    setCarousels((prev) => prev.filter((carousel) => carousel.id !== carouselId))
    setItems((prev) => prev.filter((item) => item.carousel_id !== carouselId))
    setExpandedCarousels((prev) => {
      const next = new Set(prev)
      next.delete(carouselId)
      return next
    })
    setDeleteConfirmId(null)

    const { error } = await supabase
      .from('helm_carousels')
      .delete()
      .eq('id', carouselId)

    if (error) {
      console.error('Failed to delete carousel:', error)
      setCarousels((prev) => [...prev, carouselToDelete].sort(sortCarousels))
      if (removedItems.length > 0) {
        setItems((prev) => [...prev, ...removedItems].sort((a, b) => a.sort_order - b.sort_order))
      }
    }
  }

  function handleDragStart(event: React.DragEvent<HTMLDivElement>, carouselId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', carouselId)
    setDraggingCarouselId(carouselId)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, carouselId: string) {
    event.preventDefault()
    if (draggingCarouselId && draggingCarouselId !== carouselId) {
      event.dataTransfer.dropEffect = 'move'
      setDragOverCarouselId(carouselId)
    }
  }

  function handleDragLeave(carouselId: string) {
    setDragOverCarouselId((current) => (current === carouselId ? null : current))
  }

  function handleDragEnd() {
    setDraggingCarouselId(null)
    setDragOverCarouselId(null)
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>, targetCarouselId: string) {
    event.preventDefault()

    const sourceCarouselId = draggingCarouselId || event.dataTransfer.getData('text/plain')
    setDragOverCarouselId(null)
    setDraggingCarouselId(null)

    if (!selectedPage || !sourceCarouselId || sourceCarouselId === targetCarouselId) {
      return
    }

    const currentPageCarousels = carousels
      .filter((carousel) => carousel.page_slug === selectedPage)
      .sort((a, b) => a.sort_order - b.sort_order)

    const sourceIndex = currentPageCarousels.findIndex((carousel) => carousel.id === sourceCarouselId)
    const targetIndex = currentPageCarousels.findIndex((carousel) => carousel.id === targetCarouselId)

    if (sourceIndex === -1 || targetIndex === -1) {
      return
    }

    const reordered = [...currentPageCarousels]
    const [moved] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    const nextSortOrders = new Map<string, number>()
    reordered.forEach((carousel, index) => {
      nextSortOrders.set(carousel.id, index)
    })

    const previousSortOrders = new Map<string, number>()
    currentPageCarousels.forEach((carousel) => {
      previousSortOrders.set(carousel.id, carousel.sort_order)
    })

    const now = new Date().toISOString()
    setCarousels((prev) => prev.map((carousel) => {
      if (carousel.page_slug !== selectedPage) return carousel
      const nextSortOrder = nextSortOrders.get(carousel.id)
      if (nextSortOrder === undefined) return carousel
      return {
        ...carousel,
        sort_order: nextSortOrder,
        updated_at: now,
      }
    }))

    const updates = Array.from(nextSortOrders.entries()).map(([id, sort_order]) => ({ id, sort_order }))

    const results = await Promise.all(
      updates.map(({ id, sort_order }) => (
        supabase
          .from('helm_carousels')
          .update({ sort_order })
          .eq('id', id)
      )),
    )

    const failed = results.find((result) => result.error)
    if (failed) {
      console.error('Failed to reorder carousels:', failed.error)
      setCarousels((prev) => prev.map((carousel) => {
        if (carousel.page_slug !== selectedPage) return carousel
        const previousSortOrder = previousSortOrders.get(carousel.id)
        if (previousSortOrder === undefined) return carousel
        return {
          ...carousel,
          sort_order: previousSortOrder,
        }
      }))
    }
  }

  return (
    <div className="-m-8 flex h-screen overflow-hidden">
      <aside className="flex w-[280px] flex-col border-r border-gray-800 bg-gray-900 text-white">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-gray-200">Carousels</h1>
          <button
            type="button"
            onClick={() => {
              setIsCreatingPage(true)
              setNewPageValue('')
            }}
            className="rounded-md bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-500"
            title="Create page group"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isCreatingPage && (
            <div className="mb-3 rounded-lg border border-gray-700 bg-gray-800 p-3">
              <label className="mb-2 block text-xs font-medium text-gray-300">New page slug</label>
              <input
                autoFocus
                value={newPageValue}
                onChange={(event) => setNewPageValue(event.target.value)}
                placeholder="e.g. home-featured"
                className="w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void createPageGroup()
                  }
                  if (event.key === 'Escape') {
                    setIsCreatingPage(false)
                    setNewPageValue('')
                  }
                }}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void createPageGroup()}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingPage(false)
                    setNewPageValue('')
                  }}
                  className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {pageGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-400">
              No pages yet - create one to get started
            </p>
          ) : (
            <div className="space-y-2">
              {pageGroups.map((group) => {
                const isSelected = group.pageSlug === selectedPage
                const copied = copiedPageSlug === group.pageSlug

                return (
                  <div
                    key={group.pageSlug}
                    className={`rounded-lg border bg-gray-800 shadow-sm ${
                      isSelected
                        ? 'border-blue-500/70 border-l-4 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPage(group.pageSlug)}
                      className="w-full px-3 py-2 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-white">{group.pageSlug}</p>
                      <p className="mt-1 text-xs text-gray-300">{group.count} carousel{group.count === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-[11px] text-gray-400">Updated {formatTimestamp(group.latestUpdatedAt)}</p>
                    </button>
                    <div className="border-t border-gray-700 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void handleCopySnippet(group.pageSlug)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-300 transition-colors hover:text-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? 'Copied snippet' : 'Copy embed snippet'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto w-full max-w-5xl p-6">
          {!selectedPage ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
              No pages yet - create one to get started
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Page</p>
                  <h2 className="text-2xl font-semibold text-gray-900">{selectedPage}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void createCarousel()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" />
                  Add Carousel
                </button>
              </div>

              {selectedCarousels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
                  No carousels on this page yet
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedCarousels.map((carousel) => {
                    const carouselItems = itemsByCarousel.get(carousel.id) ?? []
                    const isExpanded = expandedCarousels.has(carousel.id)
                    const isEditing = editingCarouselId === carousel.id
                    const isDragging = draggingCarouselId === carousel.id
                    const isDragOver = dragOverCarouselId === carousel.id && draggingCarouselId !== carousel.id

                    return (
                      <div
                        key={carousel.id}
                        draggable={!isEditing}
                        onDragStart={(event) => handleDragStart(event, carousel.id)}
                        onDragOver={(event) => handleDragOver(event, carousel.id)}
                        onDragLeave={() => handleDragLeave(carousel.id)}
                        onDrop={(event) => void handleDrop(event, carousel.id)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-xl border bg-white shadow-sm transition ${
                          isDragOver ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
                        } ${isDragging ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3 p-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />

                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onBlur={() => void saveCarouselTitle(carousel, editingTitle)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    void saveCarouselTitle(carousel, editingTitle)
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    cancelTitleEdit()
                                  }
                                }}
                                className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => beginTitleEdit(carousel)}
                                className="truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700"
                                title="Click to rename"
                              >
                                {carousel.title}
                              </button>
                            )}

                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {carouselItems.length} item{carouselItems.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void toggleCarouselActive(carousel)}
                              role="switch"
                              aria-checked={carousel.is_active}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                carousel.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                              title={carousel.is_active ? 'Active' : 'Inactive'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  carousel.is_active ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleExpanded(carousel.id)}
                              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId((current) => current === carousel.id ? null : carousel.id)}
                              className="rounded-md p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Delete carousel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {deleteConfirmId === carousel.id && (
                          <div className="flex items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <span>Delete this carousel and all its items?</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void confirmDeleteCarousel(carousel.id)}
                                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
                            {carouselItems.length === 0 ? (
                              <p className="text-xs text-gray-500">No items in this carousel yet</p>
                            ) : (
                              <div className="space-y-1.5">
                                {carouselItems.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium text-gray-800">{item.title || 'Untitled item'}</p>
                                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">{item.item_type}</span>
                                        {!item.is_active && <span className="text-gray-400">Inactive</span>}
                                      </div>
                                    </div>
                                    <span className={`h-2 w-2 rounded-full ${item.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
