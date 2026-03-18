import type { Page } from 'playwright-core'
import type { PageConfig } from '@/config/l1-pages'

interface RawNavLink {
  label: string
  href: string
  depth: number
  parentLabel?: string
}

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function pageKey(url: string) {
  const nCode = url.match(/N-\d+/i)?.[0]?.toUpperCase()
  if (nCode) return nCode

  try {
    const parsed = new URL(url)
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.origin}${normalizedPath}${parsed.search}`
  } catch {
    return url.trim()
  }
}

function inferLabelFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/' || parsed.pathname === '') return 'Homepage'
    const segments = parsed.pathname.split('/').filter(Boolean)
    const meaningful = segments.filter((segment) => segment !== 'browse' && segment !== '_' && !segment.startsWith('N-'))
    const raw = meaningful[meaningful.length - 1] || parsed.pathname
    return raw.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  } catch {
    return 'Other'
  }
}

async function openNavigation(page: Page) {
  const selectors = [
    'button[aria-label*="menu" i]',
    '.hamburger',
    '.nav-toggle',
    '[data-testid*="menu"]',
  ]

  for (const selector of selectors) {
    const trigger = page.locator(selector).first()
    if (await trigger.count().catch(() => 0)) {
      const visible = await trigger.isVisible().catch(() => false)
      if (!visible) continue
      await trigger.click({ force: true }).catch(() => {})
      await page.waitForTimeout(750)
      return
    }
  }
}

export async function scrapeNavigation(page: Page): Promise<PageConfig[]> {
  await page.goto('https://www.mynavyexchange.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  await openNavigation(page)

  const rawLinks = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('.main-nav, #main-nav, nav[role="navigation"], nav, [class*="menu"], [class*="nav"]'))
    const scopeRoots = roots.length > 0 ? roots : [document.body]

    function normalize(value: string) {
      return value.replace(/\s+/g, ' ').trim()
    }

    function inferDepth(anchor: HTMLAnchorElement, root: Element) {
      let depth = 1
      let node: Element | null = anchor.closest('li')
      while (node && node !== root) {
        const parentList = node.parentElement?.closest('li')
        if (!parentList) break
        depth += 1
        node = parentList
      }
      return depth
    }

    function inferParentLabel(anchor: HTMLAnchorElement, root: Element) {
      let node: Element | null = anchor.closest('li')?.parentElement?.closest('li') ?? null
      while (node && node !== root) {
        const parentAnchor = node.querySelector(':scope > a, :scope > button, :scope > [role="button"]')
        const label = normalize(parentAnchor?.textContent || '')
        if (label) return label
        node = node.parentElement?.closest('li') ?? null
      }
      return undefined
    }

    const results: RawNavLink[] = []

    for (const root of scopeRoots) {
      const anchors = Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[]
      for (const anchor of anchors) {
        const hrefValue = anchor.getAttribute('href') || ''
        if (!hrefValue || hrefValue.startsWith('#') || hrefValue.startsWith('javascript:')) continue

        const href = new URL(hrefValue, window.location.href).toString()
        if (!href.startsWith('https://www.mynavyexchange.com')) continue
        if (!href.includes('/browse/') && href !== 'https://www.mynavyexchange.com/' && href !== 'https://www.mynavyexchange.com') continue

        const label = normalize(anchor.textContent || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '')
        if (!label || label.length < 2) continue
        if (/sign in|login|account|track order|help|gift card/i.test(label)) continue

        results.push({
          label,
          href,
          depth: inferDepth(anchor, root),
          parentLabel: inferParentLabel(anchor, root),
        })
      }
    }

    return results
  })

  const deduped = new Map<string, PageConfig>()

  for (const raw of rawLinks) {
    const key = pageKey(raw.href)
    const normalizedLabel = normalizeLabel(raw.label) || inferLabelFromUrl(raw.href)
    const depth = Math.max(1, Math.min(raw.depth, 3))
    const existing = deduped.get(key)

    if (!existing || depth < existing.depth) {
      deduped.set(key, {
        label: normalizedLabel,
        url: raw.href,
        depth,
        parentLabel: raw.parentLabel ? normalizeLabel(raw.parentLabel) : undefined,
        isDynamic: true,
      })
    }
  }

  return Array.from(deduped.values())
}
