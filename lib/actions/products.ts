'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { products, inventoryItems, inventoryStatus } from '../db/schema'
import { requireAdmin } from '../auth'

const cents = (v: number | string | null | undefined) =>
  Math.max(0, Math.round((Number(v) || 0) * 100))

export interface ProductInput {
  name: string
  category?: string | null
  priceDollars?: number | string | null
  active?: boolean
  description?: string | null
}

export async function createProduct(input: ProductInput): Promise<string> {
  await requireAdmin()
  const [row] = await db
    .insert(products)
    .values({
      name: input.name.trim(),
      category: input.category?.trim() || null,
      priceCents: cents(input.priceDollars),
      active: input.active ?? true,
      description: input.description?.trim() || null,
    })
    .returning()
  revalidatePath('/products')
  return row.id
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<void> {
  await requireAdmin()
  const patch: Partial<typeof products.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.category !== undefined) patch.category = input.category?.trim() || null
  if (input.priceDollars !== undefined) patch.priceCents = cents(input.priceDollars)
  if (input.active !== undefined) patch.active = input.active
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  await db.update(products).set(patch).where(eq(products.id, id))
  revalidatePath('/products')
}

type InvStatus = (typeof inventoryStatus.enumValues)[number]

export async function createInventoryItem(input: {
  productId?: string | null
  label: string
  credentials?: string | null
  notes?: string | null
}): Promise<void> {
  await requireAdmin()
  await db.insert(inventoryItems).values({
    productId: input.productId || null,
    label: input.label.trim(),
    credentials: input.credentials?.trim() || null,
    notes: input.notes?.trim() || null,
  })
  revalidatePath('/inventory')
}

export async function setInventoryStatus(id: string, status: InvStatus): Promise<void> {
  await requireAdmin()
  await db.update(inventoryItems).set({ status }).where(eq(inventoryItems.id, id))
  revalidatePath('/inventory')
}

/**
 * Attach an inventory item to an order (spec §32). Only an `available` item can
 * be assigned, so the same item can never go to two customers. Throws otherwise.
 */
export async function assignInventoryToOrder(itemId: string, orderId: string): Promise<void> {
  await requireAdmin()
  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, itemId) })
  if (!item) throw new Error('Item not found')
  if (item.status !== 'available' || item.orderId) throw new Error('Item is not available')
  await db.update(inventoryItems).set({ status: 'sold', orderId }).where(eq(inventoryItems.id, itemId))
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/inventory')
}

export async function releaseInventory(itemId: string): Promise<void> {
  await requireAdmin()
  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, itemId) })
  const orderId = item?.orderId
  await db.update(inventoryItems).set({ status: 'available', orderId: null }).where(eq(inventoryItems.id, itemId))
  if (orderId) revalidatePath(`/orders/${orderId}`)
  revalidatePath('/inventory')
}
