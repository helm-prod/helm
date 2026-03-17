export interface PanelFacts {
  panel_type: 'PRODUCT' | 'BRAND' | 'CATEGORY'
  featured_product: string | null
  brand_name: string | null
  price_shown: string | null
  offer_language: string | null
  cta_text: string | null
}

export function buildPass1UserMessage(): string {
  return `You are analyzing a marketing panel image from a Navy Exchange e-commerce site.

Extract the following facts from this panel image. Be specific and literal — only report what you can actually see.

Respond in this exact JSON format only, no markdown:
{
  "panel_type": "<PRODUCT|BRAND|CATEGORY>",
  "featured_product": "<specific product name visible in the panel, or null if none>",
  "brand_name": "<brand name or logo visible, or null if none>",
  "price_shown": "<exact price text visible in the panel image, or null if no price shown>",
  "offer_language": "<any promotional or sale copy visible, e.g. 'Save 30%', 'Free Gift', 'New Arrivals', or null if none>",
  "cta_text": "<call to action text if visible, e.g. 'Shop Now', 'Learn More', or null>"
}

Panel type definitions:
- PRODUCT: Panel features a specific product with a name, image, or price. Customer expects to find and buy that exact product.
- BRAND: Panel tells a brand story, shows a brand logo, or features brand imagery with products. Customer expects a brand landing page.
- CATEGORY: Panel promotes a department, category, or lifestyle theme. Customer expects a relevant category or landing page.

Only classify as PRODUCT if a specific named product is clearly visible. A brand logo with products shown is still BRAND.`
}

export function buildPass2UserMessage(params: {
  panelFacts: PanelFacts
  outboundPageTitle: string
  httpStatus: number | null
  redirectCount: number
  outboundText: {
    prices: string[]
    headings: string[]
    productCount: number | null
    isOutOfStock: boolean
    hasEmptyResults: boolean
  }
}): string {
  const { panelFacts, outboundPageTitle, httpStatus, redirectCount, outboundText } = params

  return `You are a quality checker for a Navy Exchange e-commerce site.

PANEL FACTS (extracted from the panel image):
- Panel type: ${panelFacts.panel_type}
- Featured product: ${panelFacts.featured_product || 'none identified'}
- Brand shown: ${panelFacts.brand_name || 'none identified'}
- Price shown on panel: ${panelFacts.price_shown || 'none'}
- Promotional copy: ${panelFacts.offer_language || 'none'}
- CTA text: ${panelFacts.cta_text || 'none'}

DESTINATION PAGE CONTEXT:
- Title: ${outboundPageTitle}
- HTTP status: ${httpStatus ?? 'unknown'}
- Redirect hops: ${redirectCount}
- Prices found on destination: ${outboundText.prices.join(', ') || 'none found'}
- Headings/products found on destination: ${outboundText.headings.join(', ') || 'none found'}
- Products visible above fold: ${outboundText.productCount ?? 'unknown'}
- Out of stock signals detected: ${outboundText.isOutOfStock ? 'yes' : 'no'}
- Empty results or "no products found" detected: ${outboundText.hasEmptyResults ? 'yes' : 'no'}

Your job: using the panel facts above as ground truth, assess how well the destination page delivers on what the panel promised the customer.

SCORING RULES BY PANEL TYPE:

PRODUCT panel (featured_product is not null):
- 90-100: The specific featured product is clearly visible and purchasable.
- 70-89: The featured product is present but not prominently featured (e.g. below the fold or in a list).
- 50-69: Correct category but the specific product is not findable.
- 30-49: Loosely related destination but the featured product is absent.
- 0-29: Destination is wrong, broken, or the product is completely absent.
CRITICAL: If featured_product is not null, the destination MUST show that product. If it does not, flag item_not_found.

BRAND panel:
- 90-100: Destination is a landing page for that brand showing their products.
- 70-89: Destination shows brand products but is not a dedicated brand page.
- 50-69: Related category but the brand is not prominent.
- 30-49: Off-topic or different brand featured.
- 0-29: Broken, wrong, or completely unrelated.
NOTE: A brand panel correctly linking to that brand's page is intended behavior. Do NOT flag any issue.

CATEGORY panel:
- 90-100: Destination is the correct category page with relevant products.
- 70-89: Closely related category.
- 50-69: Loosely related.
- 30-49: Different category entirely.
- 0-29: Broken or completely unrelated.

PRICE CHECK (only when price_shown is not null):
If the panel shows a specific price and that price is nowhere on the destination, flag price_mismatch.

OFFER CHECK (only when offer_language is not null):
If the panel mentions a specific discount or promotion and the destination shows no evidence of it, flag weak_correlation with detail explaining the mismatch.

EMPTY RESULTS CHECK:
If the destination shows zero products, an empty grid, or a "no results" message, flag empty_destination.

ISSUE TYPES — only flag real problems a customer would encounter:
- item_not_found: The specific featured product from the panel is not on the destination. PRODUCT panels only.
- price_mismatch: Panel shows a specific price not found on the destination. Only when price_shown is not null.
- wrong_destination: Destination is categorically unrelated to the panel. The panel is about shoes but the destination shows kitchen appliances. This is a production error — the link is wrong.
- weak_correlation: Destination is in the right general area but does not deliver on the specific promise. The panel says "Nike Running Shoes" but the destination is a general athletics page. This is a merchandising optimization — the link target or the panel creative should be reconsidered.
- empty_destination: Destination renders with no products, an empty grid, or a "no results found" state.
- dead_link: Destination is a hard error page (404, 500, etc.).
- redirect: Destination redirects to something unrelated to the panel.
- none: No issues — the destination delivers on the panel's promise.

Do NOT flag:
- Brand panels linking to brand pages (this is correct behavior)
- Category panels linking to category pages (this is correct behavior)
- Promotional landing pages that match the panel's offer
- Minor layout or navigation differences

Respond in this exact JSON format only, no markdown:
{
  "score": <integer 0-100>,
  "issues": [
    { "type": "<item_not_found|price_mismatch|wrong_destination|weak_correlation|empty_destination|dead_link|redirect|none>", "detail": "<concise, producer-actionable description>" }
  ],
  "reasoning": "<2-3 sentences explaining what the customer experience would be. Start with what the panel promises, then what the destination delivers.>",
  "destination_relevance_keywords": ["<3-5 most prominent product, brand, or category terms visible on the destination page>"]
}

If there are no issues: "issues": [{"type":"none","detail":"Panel-to-destination experience is aligned"}]`
}
