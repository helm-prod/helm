# Panel Detection Audit

Date: 2026-03-19
Scope: `scripts/run-panel-score.ts`, `src/lib/site-quality/panel-scraper.ts`, `src/lib/site-quality/panel-scorer.ts`
Reference diff: `git diff cf789e7 HEAD -- scripts/run-panel-score.ts src/lib/site-quality/panel-scorer.ts src/lib/site-quality/panel-scraper.ts`

## 1. Exact code responsible for detecting panels on a page

`scripts/run-panel-score.ts` does not scrape the DOM directly anymore. It delegates panel detection to `scrapePanels()` from [`src/lib/site-quality/panel-scraper.ts`](./src/lib/site-quality/panel-scraper.ts).

Import in [`src/lib/site-quality/panel-scorer.ts`](./src/lib/site-quality/panel-scorer.ts):

```ts
import { scrapePanels } from './panel-scraper'
```

Current panel detection function from [`src/lib/site-quality/panel-scraper.ts`](./src/lib/site-quality/panel-scraper.ts):

```ts
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
```

## 2. CSS selectors and DOM queries used to find panels

Current selectors in [`src/lib/site-quality/panel-scraper.ts`](./src/lib/site-quality/panel-scraper.ts):

```ts
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
```

Additional homepage-only DOM query:

```ts
document.querySelectorAll('a, [role="link"], [onclick]')
```

Additional DOM filters inside `page.evaluate()`:

```ts
element.closest('nav, [role="navigation"], header nav, [class*="mega-menu"], [class*="menu"], [class*="nav"]')
element.closest('[class*="product-card"], [class*="product-item"], [class*="product-tile"], [class*="productCard"], [class*="productItem"], [data-testid*="product"]')
```

## 3. Conditions that can cause the scraper to skip panel detection

There are multiple gates that can zero out detection:

### During candidate collection

- `anchorFor(img)` / `anchorFor(element)` must find a clickable ancestor `<a>`
- `isProductTile(...)` causes the candidate to be discarded
- `toAbsoluteUrl(...)` must produce both `imageUrl` and `outboundHref`
- Only nodes matched by the selector lists are even considered

### After candidate collection

For every `rawPanels` item:

```ts
if (item.inNav) continue
if (!item.outboundHref) continue
if (item.width < 100 || item.height < 50) continue
if (EXCLUDED_ASSET_MARKERS.some((marker) => item.imageUrl.includes(marker))) continue
```

### Global error path

If `page.goto(...)`, the `page.evaluate(...)`, or anything else in `scrapePanels()` throws, the function returns:

```ts
{
  pageUrl: url,
  pageLabel: label,
  panels: [],
  scrapedAt,
  error: ...
}
```

That means any exception in the scrape path also looks like "0 panels found" to the caller unless the caller logs `scrapeResult.error`.

### Ad-week filtering in the runner

After scraping:

```ts
const panels = adWeek
  ? scrapeResult.panels.filter((p) => p.adWeek === adWeek)
  : scrapeResult.panels
```

If the run is invoked with `adWeek` and the scraped panels have mismatched `adWeek`, this can reduce the page to zero scorable panels. In the current scraper, non-regex matches fall back to `currentWeek`, so this is less likely than the selector/filter issue.

## 4. Flow: page navigation -> panel detection -> scoring

Current run flow in [`scripts/run-panel-score.ts`](./scripts/run-panel-score.ts):

```ts
for (const pageConfig of pages) {
  console.log(`Scraping ${pageConfig.label}...`)
  const scrapeResult = await scrapePanels(page, pageConfig.url, pageConfig.label)
  await refreshTaxonomyFromSubNav(page, pageConfig)

  const panels = adWeek
    ? scrapeResult.panels.filter((p) => p.adWeek === adWeek)
    : scrapeResult.panels

  const limitedPanels = panels.slice(0, MAX_PANELS_PER_PAGE)
  const isHomepage = pageConfig.depth === 0 || pageConfig.url === 'https://www.mynavyexchange.com'

  if (limitedPanels.length > 0 || isHomepage) {
    // page triage branch
  } else {
    console.log(`  Skipping page triage for ${pageConfig.label} — no scraped panels`)
  }

  for (let i = 0; i < limitedPanels.length; i += 1) {
    // scoring loop
  }
}
```

The exact "no scraped panels" log message is emitted here:

```ts
console.log(`  Skipping page triage for ${pageConfig.label} — no scraped panels`)
```

Trigger condition:

```ts
limitedPanels.length === 0 && !isHomepage
```

Important: this message is not emitted by the panel scraper. It is emitted by the runner after `scrapePanels()` has already returned an empty `panels` array for that page.

## 5. `panel-scorer.ts` check

[`src/lib/site-quality/panel-scorer.ts`](./src/lib/site-quality/panel-scorer.ts) also imports and uses the same shared scraper:

```ts
import { scrapePanels } from './panel-scraper'
```

So both the script path and the library path depend on the same detection logic in `panel-scraper.ts`.

## 6. What changed since `cf789e7`

The most important change is in [`src/lib/site-quality/panel-scraper.ts`](./src/lib/site-quality/panel-scraper.ts).

### Working-era approach at `cf789e7`

Before, the scraper was broad and simple:

```ts
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
```

### Current approach

The scraper now:

- no longer scans all `<img>` tags
- relies on a narrow selector list
- requires clickable ancestry up front
- filters out anything inside containers matching broad nav/menu selectors
- filters out anything inside broad product-tile selectors
- accepts fallback dynamic panels when regex parsing fails

### `run-panel-score.ts` changes

`run-panel-score.ts` changed heavily after `cf789e7`, but none of those changes are the primary DOM-detection rewrite:

- page source changed from `L1_PAGES` to `site_taxonomy`
- page triage was added
- suppression logic was added
- GA4 enrichment was added
- taxonomy refresh was added

The actual panel extraction call is still:

```ts
const scrapeResult = await scrapePanels(page, pageConfig.url, pageConfig.label)
```

So the scoring script still depends on the shared scraper doing its job.

### `panel-scorer.ts` changes

`panel-scorer.ts` gained suppression logic and fingerprints, but still uses the same `scrapePanels()` import. It did not add a second, competing scrape path.

## 7. Best guess for why panels are not being found

Best guess: the regression is in the March 18 rewrite of `src/lib/site-quality/panel-scraper.ts`, not in the runner.

Why:

- The last known good version at `cf789e7` scanned every `<img>` on the page, then filtered by `/assets/` and the panel filename regex.
- The current version only considers elements that match a relatively narrow set of structural selectors.
- It also discards anything:
  - without a clickable ancestor,
  - inside anything matching broad nav/menu selectors,
  - inside anything matching broad product-tile selectors,
  - smaller than `100x50`,
  - or lacking extracted `imageUrl` / `outboundHref`.

The strongest hypothesis is that the current selector-based collection is producing an empty or near-empty `rawPanels` array on NEXCOM pages sitewide, because the real promotional assets do not match those selectors reliably after page load. The old scraper did not depend on page structure nearly as much; it just found all images and then recognized valid panel assets by their `/assets/.../Week...jpg` URL pattern.

In short: panel detection likely broke when the scraper changed from "scan all images, then filter by asset URL pattern" to "only inspect specific DOM shapes, then filter aggressively." The site structure appears not to match those new assumptions, so the scraper returns zero candidates before scoring even begins.
