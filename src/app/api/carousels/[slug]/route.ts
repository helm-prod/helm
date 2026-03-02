import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATIC_ALLOWED_ORIGINS = [
  'https://www.mynavyexchange.com',
  'https://mynavyexchange.com',
  'http://localhost:3000',
];

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    return `${protocol}://${forwardedHost}`;
  }

  const host = request.headers.get('host');
  if (host) {
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}

function getAllowedOrigins(request: NextRequest) {
  const allowedOrigins = new Set(STATIC_ALLOWED_ORIGINS);
  const runtimeOrigin = getRequestOrigin(request);
  if (runtimeOrigin) {
    allowedOrigins.add(normalizeOrigin(runtimeOrigin));
  }

  const envOrigins = [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
    (value): value is string => Boolean(value)
  );
  for (const envOrigin of envOrigins) {
    allowedOrigins.add(normalizeOrigin(envOrigin));
  }

  return allowedOrigins;
}

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = getAllowedOrigins(request);
  const fallbackOrigin = normalizeOrigin(getRequestOrigin(request) || STATIC_ALLOWED_ORIGINS[0]);
  const allowedOrigin =
    origin && allowedOrigins.has(normalizeOrigin(origin))
      ? normalizeOrigin(origin)
      : fallbackOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const headers = getCorsHeaders(request);
  
  try {
    const { slug } = await params;

    const { data: carousels, error: carouselError } = await supabase
      .from('helm_carousels')
      .select('id, title, sort_order')
      .eq('page_slug', slug)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (carouselError) throw carouselError;
    if (!carousels || carousels.length === 0) {
      return NextResponse.json({ page: slug, carousels: [] }, { headers });
    }

    const carouselIds = carousels.map(c => c.id);

    const { data: items, error: itemsError } = await supabase
      .from('helm_carousel_items')
      .select('id, carousel_id, item_type, product_id, title, brand, price, image_url, link_url, sort_order')
      .in('carousel_id', carouselIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (itemsError) throw itemsError;

    const result = {
      page: slug,
      carousels: carousels.map(carousel => ({
        id: carousel.id,
        title: carousel.title,
        items: (items || [])
          .filter(item => item.carousel_id === carousel.id)
          .map(({ carousel_id, ...item }) => item),
      })),
    };

    return NextResponse.json(result, { headers });
  } catch (error) {
    console.error('Carousel API error:', error);
    return NextResponse.json(
      { error: 'Failed to load carousels' },
      { status: 500, headers }
    );
  }
}
