import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_ORIGINS = [
  'https://www.mynavyexchange.com',
  'https://mynavyexchange.com',
  'https://helm.nexweb.dev',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);
  
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
