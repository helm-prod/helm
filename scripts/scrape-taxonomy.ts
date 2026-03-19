import { createClient } from '@supabase/supabase-js'
import playwright from 'playwright'
import { L1_PAGES } from '../src/config/l1-pages'

interface RawTaxonomyEntry {
  panelId: string
  label: string
  url: string
  depth: number
  parentPanelId: string | null
}

interface NormalizedTaxonomyEntry {
  panelId: string
  label: string
  url: string
  depth: number
  parentUrl: string | null
  aorOwner: string | null
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function canonicalizeUrl(url: string) {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

function resolveAorOwner(entry: RawTaxonomyEntry, byPanelId: Map<string, RawTaxonomyEntry>) {
  const l1OwnerByLabel = new Map(L1_PAGES.map((page) => [page.label.toLowerCase(), page.aorOwner ?? null]))
  let current: RawTaxonomyEntry | undefined = entry

  while (current) {
    if (current.depth === 1) {
      return l1OwnerByLabel.get(current.label.toLowerCase()) ?? null
    }
    current = current.parentPanelId ? byPanelId.get(current.parentPanelId) : undefined
  }

  return null
}

async function main() {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    })
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    })

    const page = await context.newPage()
    await page.goto('https://www.mynavyexchange.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('[id^="category-id-"]', { state: 'attached', timeout: 30000 })
    const panelCount = await page.evaluate(() => document.querySelectorAll('[id^="category-id-"]').length)
    console.log(`Found ${panelCount} category panels in DOM`)
    await page.waitForTimeout(1000)

    const taxonomy = await page.evaluate(() => {
      const panels = document.querySelectorAll('[id^="category-id-"]')
      const results: Array<{
        panelId: string
        label: string
        url: string
        depth: number
        parentPanelId: string | null
      }> = []

      panels.forEach((panel) => {
        const id = panel.id
        const firstLink = panel.querySelector('a')
        if (!firstLink || !(firstLink instanceof HTMLAnchorElement)) return

        const label = (firstLink.textContent || '')
          .replace('Shop All', '')
          .replace(/\n/g, '')
          .trim()
        const url = firstLink.href

        if (!url || url === 'https://www.mynavyexchange.com/' || url === `${window.location.origin}/`) return

        const parts = id.replace('category-id-', '').split('-')
        let depth: number
        if (parts.length === 1) depth = 1
        else if (parts.length === 3) depth = 2
        else if (parts.length === 5) depth = 3
        else depth = Math.ceil(parts.length / 2)

        let parentPanelId: string | null = null
        if (parts.length >= 3) {
          parentPanelId = `category-id-${parts.slice(0, -2).join('-')}`
        }

        results.push({ panelId: id, label, url, depth, parentPanelId })
      })

      panels.forEach((panel) => {
        const parts = panel.id.replace('category-id-', '').split('-')
        if (parts.length !== 3) return

        const links = panel.querySelectorAll('a')
        Array.from(links).forEach((link, index) => {
          if (!(link instanceof HTMLAnchorElement)) return
          if (index === 0) return

          const href = link.href
          const hasDataCategory = link.hasAttribute('data-category')
          if (
            href &&
            href !== 'https://www.mynavyexchange.com/' &&
            href !== `${window.location.origin}/` &&
            !hasDataCategory &&
            href.includes('/browse/')
          ) {
            const leafLabel = (link.textContent || '').trim()
            if (!leafLabel) return
            results.push({
              panelId: '',
              label: leafLabel,
              url: href,
              depth: 3,
              parentPanelId: panel.id,
            })
          }
        })
      })

      return results
    })

    if (taxonomy.length === 0) {
      throw new Error('No taxonomy entries found in static category panels')
    }

    const byPanelId = new Map(taxonomy.filter((entry) => entry.panelId).map((entry) => [entry.panelId, entry]))
    const normalized = new Map<string, NormalizedTaxonomyEntry>()

    for (const entry of taxonomy) {
      const url = canonicalizeUrl(entry.url)
      const parentUrl = entry.parentPanelId ? canonicalizeUrl(byPanelId.get(entry.parentPanelId)?.url || '') || null : null
      if (!url.includes('/browse/')) continue

      const existing = normalized.get(url)
      const candidate: NormalizedTaxonomyEntry = {
        panelId: entry.panelId,
        label: entry.label,
        url,
        depth: entry.depth,
        parentUrl: parentUrl && parentUrl !== url ? parentUrl : null,
        aorOwner: resolveAorOwner(entry, byPanelId),
      }

      if (!existing || candidate.depth < existing.depth) {
        normalized.set(url, candidate)
      }
    }

    const entries = Array.from(normalized.values())
    const now = new Date().toISOString()

    const { data: existingRows, error: existingError } = await supabase
      .from('site_taxonomy')
      .select('url, aor_owner')

    if (existingError) throw existingError

    const existingMap = new Map((existingRows || []).map((row) => [canonicalizeUrl(row.url), row]))
    const newRows: NormalizedTaxonomyEntry[] = []
    const updateRows: NormalizedTaxonomyEntry[] = []

    for (const entry of entries) {
      if (existingMap.has(entry.url)) updateRows.push(entry)
      else newRows.push(entry)
    }

    if (newRows.length > 0) {
      for (let index = 0; index < newRows.length; index += 100) {
        const chunk = newRows.slice(index, index + 100).map((entry) => ({
          url: entry.url,
          label: entry.label,
          depth: entry.depth,
          parent_url: entry.parentUrl,
          aor_owner: entry.aorOwner,
          is_monitored: entry.depth <= 2,
          first_seen_at: now,
          last_seen_at: now,
          status: 'active',
          updated_at: now,
        }))
        const { error: insertError } = await supabase.from('site_taxonomy').insert(chunk)
        if (insertError) throw insertError
      }
    }

    for (const entry of updateRows) {
      const current = existingMap.get(entry.url)
      const { error: updateError } = await supabase
        .from('site_taxonomy')
        .update({
          label: entry.label,
          depth: entry.depth,
          parent_url: entry.parentUrl,
          last_seen_at: now,
          status: 'active',
          updated_at: now,
          ...(current?.aor_owner ? {} : { aor_owner: entry.aorOwner }),
        })
        .eq('url', entry.url)

      if (updateError) throw updateError
    }

    const seenUrls = new Set(entries.map((entry) => entry.url))
    const { data: activeRows, error: activeError } = await supabase
      .from('site_taxonomy')
      .select('url')
      .eq('status', 'active')

    if (activeError) throw activeError

    const staleUrls = (activeRows || [])
      .map((row) => canonicalizeUrl(row.url))
      .filter((url) => !seenUrls.has(url))

    if (staleUrls.length > 0) {
      const { error: staleError } = await supabase
        .from('site_taxonomy')
        .update({ status: 'stale', updated_at: now })
        .in('url', staleUrls)
      if (staleError) throw staleError
    }

    const depthCounts = entries.reduce((counts, entry) => {
      counts[entry.depth] = (counts[entry.depth] ?? 0) + 1
      return counts
    }, {} as Record<number, number>)

    console.log(`Total pages discovered: ${entries.length}`)
    console.log(`Depth counts: L1=${depthCounts[1] ?? 0}, L2=${depthCounts[2] ?? 0}, L3=${depthCounts[3] ?? 0}`)
    console.log(`New pages inserted: ${newRows.length}`)
    console.log(`Existing pages updated: ${updateRows.length}`)
    console.log(`Pages marked stale: ${staleUrls.length}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Taxonomy scrape failed:', error)
  process.exit(1)
})
