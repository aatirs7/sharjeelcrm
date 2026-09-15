import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

// Public catalog read for the storefront website. Under /api/ so the auth proxy
// already lets it through; CORS is open so the site can fetch it from anywhere.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      priceCents: products.priceCents,
      description: products.description,
    })
    .from(products)
    .where(eq(products.active, true))

  return NextResponse.json(
    { products: rows },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } },
  )
}
