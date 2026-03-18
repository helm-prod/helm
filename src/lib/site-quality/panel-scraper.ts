import type { Page } from 'playwright-core'

export interface ScrapedPanel {
  imageUrl: string
  altText: string
  outboundHref: string
  categoryFolder: string
  level: string
  adWeek: number
  adYear: number
  slot: string
  isStale: boolean
}

export interface PanelScrapeResult {
  pageUrl: string
  pageLabel: string
  panels: ScrapedPanel[]
  scrapedAt: string
  error?: string
}

export interface ParsedPanelUrl {
  categoryFolder: string
  level: string
  adWeek: number
  adYear: number
  slot: string
}

const PANEL_URL_REGEX = /\/assets\/([^/]+)\/([^/]+)\/Week(\d+)\/(\d{2})-(\d{2})W_[^-]+-(.+)\.jpg/i
const EXCLUDED_ASSET_MARKERS = ['/ux/', 'Global', 'MEGA-MENU', 'HAMBURGER', 'Static']
const PANEL_SELECTORS = [
  'a > img[src*="assets"], a > img[src*="panel"]',
  '.carousel-item a img, .slick-slide a img, .swiper-slide a img, [class*="carousel"] a img, [class*="slider"] a img',
  '.hero a img, [class*="hero"] a img, .banner a img, [class*="banner"] a img',
  'a img[width], a img[height]',
]
const HOMEPAGE_PANEL_SELECTORS = [
  ...PANEL_SELECTORS,
  '[class*="feature"] a img',
  '[class*="promo"] a img',
]

interface RawPanelCandidate {
  imageUrl: string
  altText: string
  outboundHref: string
  width: number
  height: number
  inNav: boolean
  order: number
}

export function getAdWeek(date: Date): number {
  const year = date.getFullYear()
  const firstDay = new Date(year, 0, 1)
  const firstFriday = new Date(firstDay)
  while (firstFriday.getDay() !== 5) {
    firstFriday.setDate(firstFriday.getDate() + 1)
  }

  const current = new Date(date)
  current.setHours(0, 0, 0, 0)

  const diffMs = current.getTime() - firstFriday.getTime()
  if (diffMs < 0) {
    return 1
  }

  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1
}

export function parsePanelUrl(src: string): ParsedPanelUrl | null {
  const match = src.match(PANEL_URL_REGEX)
  if (!match) return null

  return {
    categoryFolder: match[1],
    level: match[2],
    adWeek: Number(match[5]),
    adYear: Number(match[4]),
    slot: match[6],
  }
}

export async function scrapePanels(page: Page, url: string, label: string): Promise<PanelScrapeResult> {
  const scrapedAt = new Date().toISOString()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const rawPanels = await page.evaluate((selectorGroups) => {
      const isHomepage = window.location.pathname === '/' || window.location.pathname === ''
      const selectors = isHomepage ? selectorGroups.homepage : selectorGroups.standard
      const candidates = new Map<string, RawPanelCandidate>()
      let order = 0

      function isInNav(element: Element) {
        return Boolean(element.closest('nav, [role="navigation"], header nav, [class*="mega-menu"], [class*="menu"], [class*="nav"]'))
      }

      function isProductTile(element: Element) {
        return Boolean(
          element.closest(
            '[class*="product-card"], [class*="product-item"], [class*="product-tile"], [class*="productCard"], [class*="productItem"], [data-testid*="product"]'
          )
        )
      }

      function toAbsoluteUrl(value: string | null | undefined) {
        if (!value) return ''
        try {
          return new URL(value, window.location.href).toString()
        } catch {
          return ''
        }
      }

      function register(candidate: RawPanelCandidate) {
        const key = candidate.imageUrl || `${candidate.outboundHref}::${candidate.order}`
        const existing = candidates.get(key)
        if (!existing || (candidate.width * candidate.height) > (existing.width * existing.height)) {
          candidates.set(key, candidate)
        }
      }

      function anchorFor(element: Element) {
        if (element instanceof HTMLAnchorElement) return element
        return element.closest('a')
      }

      function collectImage(img: HTMLImageElement) {
        const anchor = anchorFor(img)
        if (!anchor) return
        if (isProductTile(img)) return

        const imageUrl = toAbsoluteUrl(img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc)
        const outboundHref = toAbsoluteUrl(anchor.getAttribute('href'))
        if (!imageUrl || !outboundHref) return

        const rect = img.getBoundingClientRect()
        register({
          imageUrl,
          altText: img.getAttribute('alt') || anchor.textContent?.trim() || '',
          outboundHref,
          width: Math.max(img.naturalWidth || 0, Math.round(rect.width)),
          height: Math.max(img.naturalHeight || 0, Math.round(rect.height)),
          inNav: isInNav(img),
          order: order += 1,
        })
      }

      function collectBackground(element: HTMLElement) {
        const anchor = anchorFor(element)
        if (!anchor) return
        if (isProductTile(element)) return

        const styles = window.getComputedStyle(element)
        const backgroundImage = styles.backgroundImage
        const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/i)
        if (!match?.[1]) return

        const imageUrl = toAbsoluteUrl(match[1])
        const outboundHref = toAbsoluteUrl(anchor.getAttribute('href'))
        if (!imageUrl || !outboundHref) return

        const rect = element.getBoundingClientRect()
        register({
          imageUrl,
          altText: element.getAttribute('aria-label') || anchor.textContent?.trim() || '',
          outboundHref,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          inNav: isInNav(element),
          order: order += 1,
        })
      }

      for (const selector of selectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (node instanceof HTMLImageElement) {
            collectImage(node)
          } else if (node instanceof HTMLElement) {
            collectBackground(node)
          }
        }
      }

      if (isHomepage) {
        const backgroundElements = Array.from(document.querySelectorAll('a, [role="link"], [onclick]'))
          .filter((node): node is HTMLElement => node instanceof HTMLElement)
          .filter((node) => {
            const styles = window.getComputedStyle(node)
            return styles.backgroundImage && styles.backgroundImage !== 'none'
          })

        for (const element of backgroundElements) {
          collectBackground(element)
        }
      }

      return Array.from(candidates.values())
    }, { standard: PANEL_SELECTORS, homepage: HOMEPAGE_PANEL_SELECTORS })

    const currentWeek = getAdWeek(new Date())
    const panels: ScrapedPanel[] = []

    for (const item of rawPanels) {
      if (item.inNav) continue
      if (!item.outboundHref) continue
      if (item.width < 100 || item.height < 50) continue
      if (EXCLUDED_ASSET_MARKERS.some((marker) => item.imageUrl.includes(marker))) continue

      const parsed = parsePanelUrl(item.imageUrl)
      const fallbackSlot = `slot-${String(item.order).padStart(2, '0')}`

      panels.push({
        imageUrl: item.imageUrl,
        altText: item.altText,
        outboundHref: item.outboundHref,
        categoryFolder: parsed?.categoryFolder ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        level: parsed?.level ?? 'dynamic',
        adWeek: parsed?.adWeek ?? currentWeek,
        adYear: parsed?.adYear ?? new Date().getFullYear(),
        slot: parsed?.slot ?? fallbackSlot,
        isStale: parsed ? parsed.adWeek !== currentWeek : false,
      })
    }

    return {
      pageUrl: url,
      pageLabel: label,
      panels: panels.filter((panel) => panel.outboundHref !== null && panel.outboundHref !== undefined && panel.outboundHref !== ''),
      scrapedAt,
    }
  } catch (error) {
    return {
      pageUrl: url,
      pageLabel: label,
      panels: [],
      scrapedAt,
      error: error instanceof Error ? error.message : 'Failed to scrape panels',
    }
  }
}
