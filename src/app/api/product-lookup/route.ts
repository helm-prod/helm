import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as crypto from 'crypto'

// Cache the auth token so we don't re-auth on every request
let cachedToken: { token: string; expiresAt: number } | null = null

async function getMonetateToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token
  }

  const privateKey = process.env.MONETATE_PRIVATE_KEY
  const apiUser = process.env.MONETATE_API_USER

  if (!privateKey || !apiUser) {
    throw new Error('Monetate API credentials not configured')
  }

  const now = Math.floor(Date.now() / 1000)

  // Build JWT header and payload
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: apiUser,
    iss: apiUser,
    aud: 'https://api.monetate.net',
    iat: now,
    exp: now + 300,
  })).toString('base64url')

  // Sign with RSA private key
  const signingInput = `${header}.${payload}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(privateKey, 'base64url')

  const jwt = `${signingInput}.${signature}`

  // Exchange JWT for access token
  const authResponse = await fetch('https://api.monetate.net/api/auth/v0/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assertion: jwt, grant_type: 'jwt' }),
  })

  if (!authResponse.ok) {
    const errorText = await authResponse.text()
    console.error('[Monetate Auth] Failed:', authResponse.status, errorText)
    throw new Error(`Monetate auth failed: ${authResponse.status}`)
  }

  const authData = await authResponse.json()
  const token = authData.data?.token

  if (!token) {
    console.error('[Monetate Auth] No token in response:', authData)
    throw new Error('No token in Monetate auth response')
  }

  // Cache token for 4 minutes (tokens are valid for 5 min)
  cachedToken = { token, expiresAt: Date.now() + 240000 }
  return token
}

export async function GET(request: NextRequest) {
  // Auth check — only authenticated Helm users can use this
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const productId = request.nextUrl.searchParams.get('id')
  if (!productId) {
    return NextResponse.json({ error: 'Missing product ID' }, { status: 400 })
  }

  const retailer = process.env.MONETATE_RETAILER || 'nexcom'

  try {
    const token = await getMonetateToken()

    // Query the product catalog
    const catalogUrl = `https://api.monetate.net/api/data/v1/${retailer}/production/data/NexcomProdProductCatalog/?id=${encodeURIComponent(productId)}`

    const catalogResponse = await fetch(catalogUrl, {
      headers: { 'Authorization': `Token ${token}` },
    })

    if (!catalogResponse.ok) {
      const errorText = await catalogResponse.text()
      console.error('[Monetate Catalog] Failed:', catalogResponse.status, errorText)

      if (catalogResponse.status === 404) {
        return NextResponse.json({
          error: 'Product not found in catalog',
          product_id: productId
        }, { status: 404 })
      }

      return NextResponse.json({ error: 'Catalog lookup failed' }, { status: 502 })
    }

    const catalogData = await catalogResponse.json()

    // Log the full response so we can see the actual field names
    console.log('[Monetate Catalog] Full response for product', productId, ':', JSON.stringify(catalogData, null, 2))

    // Extract product data with generous field name fallbacks
    // Monetate's spec uses Google-like field names but NEXCOM may have custom fields
    const product = catalogData.data || catalogData

    // Handle case where product might be in an array
    const item = Array.isArray(product) ? product[0] : product

    if (!item) {
      return NextResponse.json({
        error: 'Product not found in catalog',
        product_id: productId
      }, { status: 404 })
    }

    // Extract fields with multiple fallback field names
    const title = item.title || item.name || item.product_name || item.item_title || ''
    const brand = item.brand || item.product_brand || ''
    const price = item.sale_price || item.price || item.current_price || item.retail_price || ''
    const imageUrl = item.image_link || item.image_url || item.thumbnail || item.primary_image || ''
    const linkUrl = item.link || item.url || item.product_url || item.canonical_url || ''
    const availability = item.availability || item.stock_status || item.in_stock || ''

    // Format price — add $ if it's just a number
    let formattedPrice = String(price)
    if (formattedPrice && !formattedPrice.startsWith('$')) {
      const num = parseFloat(formattedPrice)
      if (!isNaN(num)) {
        formattedPrice = `$${num.toFixed(2)}`
      }
    }

    // Format image URL — make absolute if relative
    let formattedImageUrl = String(imageUrl)
    if (formattedImageUrl && !formattedImageUrl.startsWith('http')) {
      formattedImageUrl = `https://www.mynavyexchange.com${formattedImageUrl.startsWith('/') ? '' : '/'}${formattedImageUrl}`
    }

    // Format link URL — make relative if absolute
    let formattedLinkUrl = String(linkUrl)
    if (formattedLinkUrl.startsWith('https://www.mynavyexchange.com')) {
      formattedLinkUrl = formattedLinkUrl.replace('https://www.mynavyexchange.com', '')
    }

    const response = NextResponse.json({
      product_id: productId,
      title,
      brand: brand.toUpperCase(),
      price: formattedPrice,
      image_url: formattedImageUrl,
      link_url: formattedLinkUrl || `/product/id/${productId}`,
      availability,
      source: 'monetate',
      // Include raw data in development for debugging
      _raw: process.env.NODE_ENV === 'development' ? item : undefined,
    })

    // Cache for 5 minutes
    response.headers.set('Cache-Control', 'private, max-age=300')
    return response

  } catch (error) {
    console.error('[Product Lookup] Error:', error)

    // If Monetate fails, return a helpful error with fallback URL suggestions
    return NextResponse.json({
      error: 'Product lookup failed. You can enter details manually.',
      product_id: productId,
      // Provide URL pattern suggestions as fallback
      suggested_image_url: `https://www.mynavyexchange.com/products/images/large/${productId}_000.jpg`,
      suggested_link_url: `/product/id/${productId}`,
    }, { status: 502 })
  }
}
