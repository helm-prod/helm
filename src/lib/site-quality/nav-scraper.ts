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
    const links: Array<{ href: string; label: string; depth: number; parentLabel?: string }> = []
    const navRoots = Array.from(document.querySelectorAll('.main-nav, #main-nav, nav[role="navigation"], nav, [class*="menu"], [class*="nav"]'))
    const scopeRoots = navRoots.length > 0 ? navRoots : [document.body]

    for (const root of scopeRoots) {
      const anchors = Array.from(root.querySelectorAll('a[href]'))
      for (const element of anchors) {
        if (!(element instanceof HTMLAnchorElement)) continue

        const hrefValue = element.getAttribute('href') || ''
        if (!hrefValue || hrefValue === '#' || hrefValue.startsWith('javascript:')) continue

        const href = new URL(hrefValue, window.location.href).toString()
        if (!href.includes('mynavyexchange.com')) continue
        if (href.includes('/account/') || href.includes('/cart') || href.includes('sign-in')) continue
        if (!href.includes('/browse/') && href !== 'https://www.mynavyexchange.com/' && href !== 'https://www.mynavyexchange.com') continue

        const label = (element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '')
          .replace(/\s+/g, ' ')
          .trim()
        if (!label || label.length < 2 || label.length >= 100) continue

        let depth = 1
        let parentLabel: string | undefined
        const currentLi = element.closest('li')
        if (currentLi) {
          const parentLi = currentLi.parentElement?.closest('li') ?? null
          if (parentLi) {
            depth = 2
            const parentAnchor = parentLi.querySelector(':scope > a')
            const parentText = (parentAnchor?.textContent || '').replace(/\s+/g, ' ').trim()
            if (parentText) parentLabel = parentText

            const grandparentLi = parentLi.parentElement?.closest('li') ?? null
            if (grandparentLi) depth = 3
          }
        }

        links.push({
          href,
          label,
          depth,
          parentLabel,
        })
      }
    }

    if (links.length === 0) {
      const menuButton = document.querySelector('button[aria-label*="menu"], .hamburger, .nav-toggle, [data-testid*="menu"]')
      if (menuButton instanceof HTMLElement) menuButton.click()
    }

    return links
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
