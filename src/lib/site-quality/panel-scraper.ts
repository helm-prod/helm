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

    const rawPanels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map((img) => {
          const srcValue = img.getAttribute('src') || img.getAttribute('data-src') || ''
          const alt = img.getAttribute('alt') || ''
          const link = img.closest('a')
          return {
            src: srcValue ? new URL(srcValue, window.location.href).toString() : '',
            alt,
            href: link?.getAttribute('href') ? new URL(link.getAttribute('href') as string, window.location.href).toString() : '',
            naturalWidth: img.naturalWidth,
          }
        })
    })

    const currentWeek = getAdWeek(new Date())
    const panels: ScrapedPanel[] = []

    for (const item of rawPanels) {
      if (!item.src.includes('/assets/')) continue
      if (EXCLUDED_ASSET_MARKERS.some((marker) => item.src.includes(marker))) continue
      if (item.naturalWidth <= 300) continue

      const parsed = parsePanelUrl(item.src)
      if (!parsed) continue

      panels.push({
        imageUrl: item.src,
        altText: item.alt,
        outboundHref: item.href,
        categoryFolder: parsed.categoryFolder,
        level: parsed.level,
        adWeek: parsed.adWeek,
        adYear: parsed.adYear,
        slot: parsed.slot,
        isStale: parsed.adWeek !== currentWeek,
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
