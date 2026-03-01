'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CarouselItemType, HelmCarousel, HelmCarouselItem, Profile } from '@/lib/types/database'

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

type ItemFormValues = {
  item_type: CarouselItemType
  product_id: string
  title: string
  brand: string
  price: string
  image_url: string
  link_url: string
}

const ITEM_TYPE_META: Record<CarouselItemType, {
  label: string
  badgeClass: string
  borderClass: string
  selectedButtonClass: string
}> = {
  product: {
    label: 'Product',
    badgeClass: 'bg-blue-100 text-blue-700',
    borderClass: 'border-l-blue-400',
    selectedButtonClass: 'border-blue-500 bg-blue-500 text-white',
  },
  category: {
    label: 'Category',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    borderClass: 'border-l-indigo-600',
    selectedButtonClass: 'border-indigo-600 bg-indigo-600 text-white',
  },
  custom: {
    label: 'Custom',
    badgeClass: 'bg-purple-100 text-purple-700',
    borderClass: 'border-l-purple-500',
    selectedButtonClass: 'border-purple-500 bg-purple-500 text-white',
  },
}

function emptyItemForm(): ItemFormValues {
  return {
    item_type: 'product',
    product_id: '',
    title: '',
    brand: '',
    price: '',
    image_url: '',
    link_url: '',
  }
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

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addingItemToCarousel, setAddingItemToCarousel] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [deleteItemConfirmId, setDeleteItemConfirmId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState<ItemFormValues>(() => emptyItemForm())

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
    if (addingItemToCarousel === carouselId) {
      setAddingItemToCarousel(null)
      setItemForm(emptyItemForm())
    }
    if (editingItemId && removedItems.some((item) => item.id === editingItemId)) {
      setEditingItemId(null)
      setItemForm(emptyItemForm())
    }
    if (deleteItemConfirmId && removedItems.some((item) => item.id === deleteItemConfirmId)) {
      setDeleteItemConfirmId(null)
    }
    if (draggedItemId && removedItems.some((item) => item.id === draggedItemId)) {
      setDraggedItemId(null)
      setDragOverItemId(null)
    }

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

    if (draggedItemId) {
      return
    }

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

  function buildItemPayload(values: ItemFormValues) {
    const payload = {
      item_type: values.item_type,
      product_id: null as string | null,
      title: values.title.trim() || 'Untitled Item',
      brand: null as string | null,
      price: null as string | null,
      image_url: null as string | null,
      link_url: null as string | null,
    }

    if (values.item_type === 'category') {
      payload.image_url = toNullable(values.image_url)
      payload.link_url = toNullable(values.link_url)
      return payload
    }

    payload.product_id = toNullable(values.product_id)
    payload.brand = toNullable(values.brand)
    payload.price = toNullable(values.price)
    payload.image_url = toNullable(values.image_url)
    payload.link_url = toNullable(values.link_url)
    return payload
  }

  function resetItemEditorState() {
    setEditingItemId(null)
    setAddingItemToCarousel(null)
    setDeleteItemConfirmId(null)
    setItemForm(emptyItemForm())
  }

  function openAddItemForm(carouselId: string) {
    setAddingItemToCarousel(carouselId)
    setEditingItemId(null)
    setDeleteItemConfirmId(null)
    setItemForm(emptyItemForm())
  }

  function openEditItemForm(item: HelmCarouselItem) {
    setEditingItemId(item.id)
    setAddingItemToCarousel(null)
    setDeleteItemConfirmId(null)
    setItemForm({
      item_type: item.item_type,
      product_id: item.product_id ?? '',
      title: item.title ?? '',
      brand: item.brand ?? '',
      price: item.price ?? '',
      image_url: item.image_url ?? '',
      link_url: item.link_url ?? '',
    })
  }

  async function saveNewItem(carouselId: string) {
    const carouselItems = [...(itemsByCarousel.get(carouselId) ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    const nextSortOrder = carouselItems.length > 0
      ? Math.max(...carouselItems.map((item) => item.sort_order)) + 1
      : 0
    const now = new Date().toISOString()
    const tempId = makeTempId()
    const payload = buildItemPayload(itemForm)

    const optimisticItem: HelmCarouselItem = {
      id: tempId,
      carousel_id: carouselId,
      item_type: payload.item_type,
      product_id: payload.product_id,
      title: payload.title,
      brand: payload.brand,
      price: payload.price,
      image_url: payload.image_url,
      link_url: payload.link_url,
      sort_order: nextSortOrder,
      is_active: true,
      created_at: now,
      updated_at: now,
    }

    setItems((prev) => [...prev, optimisticItem])
    resetItemEditorState()

    const { data, error } = await supabase
      .from('helm_carousel_items')
      .insert({
        carousel_id: carouselId,
        item_type: payload.item_type,
        product_id: payload.product_id,
        title: payload.title,
        brand: payload.brand,
        price: payload.price,
        image_url: payload.image_url,
        link_url: payload.link_url,
        sort_order: nextSortOrder,
        is_active: true,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('Failed to create item:', error)
      setItems((prev) => prev.filter((item) => item.id !== tempId))
      return
    }

    setItems((prev) => prev.map((item) => (item.id === tempId ? (data as HelmCarouselItem) : item)))
  }

  async function saveEditedItem(item: HelmCarouselItem) {
    const payload = buildItemPayload(itemForm)
    const now = new Date().toISOString()
    const previousItem = item

    setItems((prev) => prev.map((entry) => entry.id === item.id
      ? {
        ...entry,
        item_type: payload.item_type,
        product_id: payload.product_id,
        title: payload.title,
        brand: payload.brand,
        price: payload.price,
        image_url: payload.image_url,
        link_url: payload.link_url,
        updated_at: now,
      }
      : entry))
    setEditingItemId(null)
    setDeleteItemConfirmId(null)
    setItemForm(emptyItemForm())

    const { error } = await supabase
      .from('helm_carousel_items')
      .update({
        item_type: payload.item_type,
        product_id: payload.product_id,
        title: payload.title,
        brand: payload.brand,
        price: payload.price,
        image_url: payload.image_url,
        link_url: payload.link_url,
      })
      .eq('id', item.id)

    if (error) {
      console.error('Failed to update item:', error)
      setItems((prev) => prev.map((entry) => entry.id === previousItem.id ? previousItem : entry))
    }
  }

  async function toggleItemActive(item: HelmCarouselItem) {
    const nextValue = !item.is_active
    const now = new Date().toISOString()

    setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, is_active: nextValue, updated_at: now } : entry))

    const { error } = await supabase
      .from('helm_carousel_items')
      .update({ is_active: nextValue })
      .eq('id', item.id)

    if (error) {
      console.error('Failed to toggle item status:', error)
      setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, is_active: item.is_active } : entry))
    }
  }

  async function confirmDeleteItem(itemId: string) {
    const snapshot = items
    const itemToDelete = snapshot.find((item) => item.id === itemId)
    if (!itemToDelete) {
      setDeleteItemConfirmId(null)
      return
    }

    const carouselId = itemToDelete.carousel_id
    const remainingCarouselItems = snapshot
      .filter((item) => item.carousel_id === carouselId && item.id !== itemId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const nextSortOrderMap = new Map<string, number>()
    remainingCarouselItems.forEach((item, index) => nextSortOrderMap.set(item.id, index))

    setItems((prev) => prev
      .filter((item) => item.id !== itemId)
      .map((item) => {
        if (item.carousel_id !== carouselId) return item
        const nextSortOrder = nextSortOrderMap.get(item.id)
        if (nextSortOrder === undefined) return item
        return { ...item, sort_order: nextSortOrder }
      }))
    if (editingItemId === itemId) {
      setEditingItemId(null)
      setItemForm(emptyItemForm())
    }
    setDeleteItemConfirmId(null)

    const { error: deleteError } = await supabase
      .from('helm_carousel_items')
      .delete()
      .eq('id', itemId)

    if (deleteError) {
      console.error('Failed to delete item:', deleteError)
      setItems(snapshot)
      return
    }

    const reorderUpdates = remainingCarouselItems
      .map((item, index) => ({ id: item.id, sort_order: index }))
      .filter(({ id, sort_order }) => {
        const original = remainingCarouselItems.find((item) => item.id === id)
        return original ? original.sort_order !== sort_order : false
      })

    if (reorderUpdates.length === 0) {
      return
    }

    const results = await Promise.all(
      reorderUpdates.map(({ id, sort_order }) => (
        supabase
          .from('helm_carousel_items')
          .update({ sort_order })
          .eq('id', id)
      )),
    )

    const failed = results.find((result) => result.error)
    if (failed) {
      console.error('Failed to resequence items after delete:', failed.error)
      setItems(snapshot)
    }
  }

  function handleItemDragStart(event: React.DragEvent<HTMLDivElement>, itemId: string) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    setDraggedItemId(itemId)
  }

  function handleItemDragOver(event: React.DragEvent<HTMLDivElement>, targetItemId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (!draggedItemId || draggedItemId === targetItemId) return

    const draggedItem = items.find((item) => item.id === draggedItemId)
    const targetItem = items.find((item) => item.id === targetItemId)
    if (!draggedItem || !targetItem || draggedItem.carousel_id !== targetItem.carousel_id) return

    event.dataTransfer.dropEffect = 'move'
    setDragOverItemId(targetItemId)
  }

  function handleItemDragEnd() {
    setDraggedItemId(null)
    setDragOverItemId(null)
  }

  async function handleItemDrop(event: React.DragEvent<HTMLDivElement>, carouselId: string, targetItemId: string) {
    event.preventDefault()
    event.stopPropagation()

    const sourceItemId = draggedItemId || event.dataTransfer.getData('text/plain')
    setDragOverItemId(null)
    setDraggedItemId(null)

    if (!sourceItemId || sourceItemId === targetItemId) {
      return
    }

    const currentCarouselItems = items
      .filter((item) => item.carousel_id === carouselId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const sourceIndex = currentCarouselItems.findIndex((item) => item.id === sourceItemId)
    const targetIndex = currentCarouselItems.findIndex((item) => item.id === targetItemId)

    if (sourceIndex === -1 || targetIndex === -1) {
      return
    }

    const reordered = [...currentCarouselItems]
    const [moved] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    const nextSortOrders = new Map<string, number>()
    reordered.forEach((item, index) => nextSortOrders.set(item.id, index))

    const previousSortOrders = new Map<string, number>()
    currentCarouselItems.forEach((item) => previousSortOrders.set(item.id, item.sort_order))

    const now = new Date().toISOString()
    setItems((prev) => prev.map((item) => {
      if (item.carousel_id !== carouselId) return item
      const nextSortOrder = nextSortOrders.get(item.id)
      if (nextSortOrder === undefined) return item
      return { ...item, sort_order: nextSortOrder, updated_at: now }
    }))

    const updates = Array.from(nextSortOrders.entries()).map(([id, sort_order]) => ({ id, sort_order }))
    const results = await Promise.all(
      updates.map(({ id, sort_order }) => (
        supabase
          .from('helm_carousel_items')
          .update({ sort_order })
          .eq('id', id)
      )),
    )

    const failed = results.find((result) => result.error)
    if (failed) {
      console.error('Failed to reorder items:', failed.error)
      setItems((prev) => prev.map((item) => {
        if (item.carousel_id !== carouselId) return item
        const previousSortOrder = previousSortOrders.get(item.id)
        if (previousSortOrder === undefined) return item
        return { ...item, sort_order: previousSortOrder }
      }))
    }
  }

  function renderItemForm(carouselId: string, mode: 'add' | 'edit', item?: HelmCarouselItem) {
    const isEdit = mode === 'edit'
    const showProductLikeFields = itemForm.item_type === 'product' || itemForm.item_type === 'custom'
    const showCategoryFields = itemForm.item_type === 'category'
    const typeOptions: CarouselItemType[] = ['product', 'category', 'custom']

    return (
      <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="mb-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Type</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {typeOptions.map((option) => {
              const isSelected = itemForm.item_type === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setItemForm((prev) => ({ ...prev, item_type: option }))}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? ITEM_TYPE_META[option].selectedButtonClass
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {ITEM_TYPE_META[option].label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Title</span>
            <input
              value={itemForm.title}
              onChange={(event) => setItemForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder={showCategoryFields ? 'Shop Spring Fashion' : 'Title'}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
            />
          </label>

          {showProductLikeFields ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Brand</span>
              <input
                value={itemForm.brand}
                onChange={(event) => setItemForm((prev) => ({ ...prev, brand: event.target.value }))}
                placeholder="Brand"
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Link URL</span>
              <input
                value={itemForm.link_url}
                onChange={(event) => setItemForm((prev) => ({ ...prev, link_url: event.target.value }))}
                placeholder="/spring-fashion"
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
              />
            </label>
          )}

          {showProductLikeFields ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Price</span>
                <input
                  value={itemForm.price}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, price: event.target.value }))}
                  placeholder="$0.00"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Product ID / RIN</span>
                <input
                  value={itemForm.product_id}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, product_id: event.target.value }))}
                  placeholder="Product ID / RIN"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-medium text-gray-600">Image URL (optional)</span>
              <input
                value={itemForm.image_url}
                onChange={(event) => setItemForm((prev) => ({ ...prev, image_url: event.target.value }))}
                placeholder="/prodimg/..."
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
              />
            </label>
          )}

          {showProductLikeFields && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Image URL</span>
                <input
                  value={itemForm.image_url}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, image_url: event.target.value }))}
                  placeholder="/prodimg/..."
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Link URL</span>
                <input
                  value={itemForm.link_url}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, link_url: event.target.value }))}
                  placeholder="/product/id/..."
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500"
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isEdit && item) {
                void saveEditedItem(item)
                return
              }
              void saveNewItem(carouselId)
            }}
            className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => resetItemEditorState()}
            className="px-1 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    )
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
                            {carouselItems.length === 0 && (
                              <p className="text-xs text-gray-500">No items in this carousel yet</p>
                            )}

                            {carouselItems.length > 0 && (
                              <div className="space-y-1.5">
                                {carouselItems.map((item) => {
                                  const isItemEditing = editingItemId === item.id
                                  const isItemDragging = draggedItemId === item.id
                                  const isItemDropTarget = dragOverItemId === item.id && draggedItemId !== item.id
                                  const productMeta = [item.brand, item.price].filter(Boolean).join(' · ')
                                  const typeMeta = ITEM_TYPE_META[item.item_type]

                                  return (
                                    <div key={item.id}>
                                      <div
                                        draggable={!isItemEditing}
                                        onDragStart={(event) => handleItemDragStart(event, item.id)}
                                        onDragOver={(event) => handleItemDragOver(event, item.id)}
                                        onDragLeave={() => setDragOverItemId((current) => (current === item.id ? null : current))}
                                        onDrop={(event) => void handleItemDrop(event, carousel.id, item.id)}
                                        onDragEnd={handleItemDragEnd}
                                        className={`rounded-md border border-l-4 bg-white px-2.5 py-1.5 transition ${
                                          typeMeta.borderClass
                                        } ${isItemDropTarget ? 'border-t-2 border-t-blue-400' : ''} ${isItemDragging ? 'opacity-50' : ''}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-400" />
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.badgeClass}`}>
                                              {typeMeta.label}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => openEditItemForm(item)}
                                              className="truncate text-left text-sm font-medium text-gray-800 hover:text-blue-700"
                                            >
                                              {item.title || 'Untitled Item'}
                                            </button>
                                            {item.item_type === 'product' && productMeta && (
                                              <span className="truncate text-xs text-gray-500">{productMeta}</span>
                                            )}
                                            {item.item_type === 'category' && item.link_url && (
                                              <span className="truncate text-xs text-gray-500">{item.link_url}</span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => void toggleItemActive(item)}
                                              role="switch"
                                              aria-checked={item.is_active}
                                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                item.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                                              }`}
                                              title={item.is_active ? 'Active' : 'Inactive'}
                                            >
                                              <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                  item.is_active ? 'translate-x-4' : 'translate-x-0.5'
                                                }`}
                                              />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => setDeleteItemConfirmId((current) => current === item.id ? null : item.id)}
                                              className="rounded-md p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                                              title="Delete item"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>

                                        {deleteItemConfirmId === item.id && (
                                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-red-100 pt-2 text-xs text-red-700">
                                            <span>Delete this item?</span>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => void confirmDeleteItem(item.id)}
                                                className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
                                              >
                                                Yes
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setDeleteItemConfirmId(null)}
                                                className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100"
                                              >
                                                No
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {isItemEditing && renderItemForm(carousel.id, 'edit', item)}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {addingItemToCarousel === carousel.id ? (
                              renderItemForm(carousel.id, 'add')
                            ) : (
                              <button
                                type="button"
                                onClick={() => openAddItemForm(carousel.id)}
                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-100"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add Item
                              </button>
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
