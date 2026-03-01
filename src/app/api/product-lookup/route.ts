import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CACHE_HEADER = { 'Cache-Control': 'private, max-age=300' }

function cachedJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: CACHE_HEADER,
  })
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const productId = request.nextUrl.searchParams.get('id')
  if (!productId || !/^\d+$/.test(productId)) {
    return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
  }

  try {
    const searchUrl = `https://www.mynavyexchange.com/search?Ntt=${productId}`
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (!response.ok) {
      return cachedJson({ error: 'Failed to fetch product page' }, { status: 502 })
    }

    const html = await response.text()

    const titleMatch = html.match(/class="product-card_title"[^>]*>([^<]+)</) || html.match(/<h1[^>]*>([^<]+)</)
    const title = titleMatch?.[1]?.trim() || ''

    const brandMatch = html.match(/class="product-card_brand"[^>]*>([^<]+)</) || html.match(/class="product_brand[^"]*"[^>]*>([^<]+)</)
    const brand = brandMatch?.[1]?.trim() || ''

    const priceMatch = html.match(/\$[\d,]+\.\d{2}/)
    const price = priceMatch?.[0] || ''

    const imgMatch = html.match(new RegExp(`products/images/\\w+/${productId}_(\\d+)\\.jpg`))
    const variant = imgMatch?.[1] || '000'
    const image_url = `https://www.mynavyexchange.com/products/images/large/${productId}_${variant}.jpg`

    const linkMatch = html.match(new RegExp(`href="(/[^"]+/${productId})"`, 'i'))
      || html.match(new RegExp(`href="(https://www\\.mynavyexchange\\.com/[^"]+/${productId})"`, 'i'))
    const link_url = linkMatch?.[1]?.replace('https://www.mynavyexchange.com', '') || `/product/id/${productId}`

    if (!title && !brand) {
      return cachedJson({
        error: 'Product not found',
        product_id: productId,
      }, { status: 404 })
    }

    return cachedJson({
      product_id: productId,
      title,
      brand: brand.toUpperCase(),
      price,
      image_url,
      link_url,
    })
  } catch (error) {
    console.error('Product lookup error:', error)
    return cachedJson({ error: 'Lookup failed' }, { status: 500 })
  }
}
