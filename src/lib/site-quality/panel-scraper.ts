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
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return ''
    }
  })()
  const isHomepage = pathname === '/' || pathname === ''

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const rawPanels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map((img) => {
          const srcValue = img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc || ''
          const alt = img.getAttribute('alt') || ''
          const link = img.closest('a')
          let href = ''
          try {
            href = link?.getAttribute('href')
              ? new URL(link.getAttribute('href') as string, window.location.href).toString()
              : ''
          } catch {}
          let src = ''
          try {
            src = srcValue ? new URL(srcValue, window.location.href).toString() : ''
          } catch {}
          return {
            src,
            alt,
            href,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            width: Math.round(img.getBoundingClientRect().width),
            height: Math.round(img.getBoundingClientRect().height),
          }
        })
    })

    const currentWeek = getAdWeek(new Date())
    const panels: ScrapedPanel[] = []

    for (const item of rawPanels) {
      const w = Math.max(item.naturalWidth || 0, item.width || 0)
      if (!item.src.includes('/assets/')) {
        if (!(isHomepage && w > 400 && item.href)) continue
      }
      if (EXCLUDED_ASSET_MARKERS.some((marker) => item.src.includes(marker))) continue

      if (w <= 300) continue

      const parsed = parsePanelUrl(item.src)
      if (!parsed && w <= 400) continue

      const fallbackSlot = `slot-${String(panels.length + 1).padStart(2, '0')}`

      panels.push({
        imageUrl: item.src,
        altText: item.alt,
        outboundHref: item.href,
        categoryFolder: parsed?.categoryFolder ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        level: parsed?.level ?? 'dynamic',
        adWeek: parsed?.adWeek ?? currentWeek,
        adYear: parsed?.adYear ?? new Date().getFullYear(),
        slot: parsed?.slot ?? fallbackSlot,
        isStale: parsed ? parsed.adWeek !== currentWeek : false,
      })
    }

    if (isHomepage) {
      const bgPanels = await page.evaluate(() => {
        const results: Array<{
          src: string
          alt: string
          href: string
          width: number
          height: number
        }> = []

        const elements = document.querySelectorAll('a, [role="link"], [onclick]')
        elements.forEach((el) => {
          if (!(el instanceof HTMLElement)) return
          const styles = window.getComputedStyle(el)
          if (!styles.backgroundImage || styles.backgroundImage === 'none') return

          const match = styles.backgroundImage.match(/url\(["']?(.*?)["']?\)/i)
          if (!match?.[1]) return

          let src = ''
          try {
            src = new URL(match[1], window.location.href).toString()
          } catch {
            return
          }

          const anchor = el instanceof HTMLAnchorElement ? el : el.closest('a')
          let href = ''
          try {
            href = anchor?.getAttribute('href')
              ? new URL(anchor.getAttribute('href')!, window.location.href).toString()
              : ''
          } catch {}

          if (!src || !href) return

          const rect = el.getBoundingClientRect()
          results.push({
            src,
            alt: el.getAttribute('aria-label') || el.textContent?.trim()?.substring(0, 100) || '',
            href,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          })
        })

        return results
      })

      for (const item of bgPanels) {
        if (item.width <= 200 || item.height <= 50) continue
        if (EXCLUDED_ASSET_MARKERS.some((marker) => item.src.includes(marker))) continue
        if (panels.some((panel) => panel.imageUrl === item.src && panel.outboundHref === item.href)) continue

        const parsed = parsePanelUrl(item.src)
        const fallbackSlot = `slot-bg-${String(panels.length + 1).padStart(2, '0')}`

        panels.push({
          imageUrl: item.src,
          altText: item.alt,
          outboundHref: item.href,
          categoryFolder: parsed?.categoryFolder ?? 'homepage',
          level: parsed?.level ?? 'dynamic',
          adWeek: parsed?.adWeek ?? currentWeek,
          adYear: parsed?.adYear ?? new Date().getFullYear(),
          slot: parsed?.slot ?? fallbackSlot,
          isStale: parsed ? parsed.adWeek !== currentWeek : false,
        })
      }
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
