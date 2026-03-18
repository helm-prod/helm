import { createClient } from '@supabase/supabase-js'
import playwright from 'playwright'
import { L1_PAGES } from '../src/config/l1-pages'

interface DiscoveredTaxonomyLink {
  url: string
  label: string
  depth: number
  parent_url: string | null
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function canonicalizeUrl(url: string) {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

function resolveAorOwner(url: string, pagesByUrl: Map<string, DiscoveredTaxonomyLink>) {
  const l1OwnerMap = new Map(L1_PAGES.map((page) => [canonicalizeUrl(page.url), page.aorOwner ?? null]))
  let currentUrl: string | null = canonicalizeUrl(url)

  while (currentUrl) {
    const knownOwner = l1OwnerMap.get(currentUrl)
    if (knownOwner) return knownOwner
    currentUrl = pagesByUrl.get(currentUrl)?.parent_url ?? null
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
    await page.waitForTimeout(2000)

    const menuSelectors = [
      'button[aria-label*="menu" i]',
      '.hamburger',
      '.nav-toggle',
      '[data-testid*="menu"]',
    ]

    let menuOpened = false
    for (const selector of menuSelectors) {
      const trigger = page.locator(selector).first()
      if (await trigger.count().catch(() => 0)) {
        const visible = await trigger.isVisible().catch(() => false)
        if (!visible) continue
        await trigger.click({ force: true }).catch(() => {})
        await page.waitForTimeout(1000)
        menuOpened = true
        break
      }
    }

    if (!menuOpened) {
      throw new Error('Failed to open hamburger menu')
    }

    const discoveredLinks = await page.evaluate(() => {
      const results: Array<{ url: string; label: string; depth: number; parent_url: string | null }> = []
      const roots = Array.from(document.querySelectorAll('.main-nav, #main-nav, nav[role="navigation"], nav, [class*="menu"], [class*="nav"]'))
      const scopeRoots = roots.length > 0 ? roots : [document.body]

      for (const root of scopeRoots) {
        for (const element of Array.from(root.querySelectorAll('a[href]'))) {
          if (!(element instanceof HTMLAnchorElement)) continue
          const hrefValue = element.getAttribute('href') || ''
          if (!hrefValue || hrefValue === '#' || hrefValue.startsWith('javascript:')) continue

          const href = new URL(hrefValue, window.location.href).toString().split('#')[0].split('?')[0]
          if (!href.includes('mynavyexchange.com')) continue
          if (href.includes('/account/') || href.includes('/cart') || href.includes('sign-in')) continue

          const label = (element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '')
            .replace(/\s+/g, ' ')
            .trim()
          if (!label || label.length < 2 || label.length >= 100) continue

          let depth = 1
          let parentUrl: string | null = null
          const currentLi = element.closest('li')
          if (currentLi) {
            const parentLi = currentLi.parentElement?.closest('li') ?? null
            if (parentLi) {
              depth = 2
              const parentAnchor = parentLi.querySelector(':scope > a')
              parentUrl = parentAnchor instanceof HTMLAnchorElement ? parentAnchor.href.split('#')[0].split('?')[0] : null

              const grandparentLi = parentLi.parentElement?.closest('li') ?? null
              if (grandparentLi) depth = 3
            }
          }

          results.push({
            url: href,
            label,
            depth,
            parent_url: parentUrl,
          })
        }
      }

      const seen = new Set<string>()
      return results.filter((entry) => {
        if (seen.has(entry.url)) return false
        seen.add(entry.url)
        return true
      })
    })

    if (discoveredLinks.length === 0) {
      throw new Error('No taxonomy links found in hamburger menu')
    }

    const canonicalLinks = discoveredLinks.map((link) => ({
      ...link,
      url: canonicalizeUrl(link.url),
      parent_url: link.parent_url ? canonicalizeUrl(link.parent_url) : null,
    }))
    const pagesByUrl = new Map(canonicalLinks.map((link) => [link.url, link]))
    const now = new Date().toISOString()

    const { data: existingRows, error: existingError } = await supabase
      .from('site_taxonomy')
      .select('url')

    if (existingError) throw existingError

    const existingUrls = new Set((existingRows || []).map((row) => canonicalizeUrl(row.url)))
    const newRows = canonicalLinks
      .filter((link) => !existingUrls.has(link.url))
      .map((link) => ({
        url: link.url,
        label: link.label,
        depth: link.depth,
        parent_url: link.parent_url,
        aor_owner: resolveAorOwner(link.url, pagesByUrl),
        is_monitored: false,
        first_seen_at: now,
        last_seen_at: now,
        status: 'active',
        updated_at: now,
      }))

    const updateRows = canonicalLinks
      .filter((link) => existingUrls.has(link.url))
      .map((link) => ({
        url: link.url,
        label: link.label,
        depth: link.depth,
        parent_url: link.parent_url,
        aor_owner: resolveAorOwner(link.url, pagesByUrl),
        last_seen_at: now,
        status: 'active',
        updated_at: now,
      }))

    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from('site_taxonomy').insert(newRows)
      if (insertError) throw insertError
    }

    if (updateRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('site_taxonomy')
        .upsert(updateRows, { onConflict: 'url', ignoreDuplicates: false })
      if (upsertError) throw upsertError
    }

    const seenUrls = new Set(canonicalLinks.map((link) => link.url))
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

    const depthCounts = canonicalLinks.reduce((counts, link) => {
      counts[link.depth] = (counts[link.depth] ?? 0) + 1
      return counts
    }, {} as Record<number, number>)

    console.log(`Discovered ${canonicalLinks.length} taxonomy pages`)
    console.log(`New pages added: ${newRows.length}`)
    console.log(`Pages updated: ${updateRows.length}`)
    console.log(`Pages marked stale: ${staleUrls.length}`)
    console.log(`Depth counts: L1=${depthCounts[1] ?? 0}, L2=${depthCounts[2] ?? 0}, L3=${depthCounts[3] ?? 0}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Taxonomy scrape failed:', error)
  process.exit(1)
})
