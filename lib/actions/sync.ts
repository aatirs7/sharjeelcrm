'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '../auth'
import { syncStripeOrders } from '../stripe-sync'

/** Admin: pull the latest Stripe charges into the CRM as orders/customers. */
export async function syncStripeNow(): Promise<{ created: number; updated: number; error?: string }> {
  await requireCapability('financials')
  const res = await syncStripeOrders()
  revalidatePath('/revenue')
  revalidatePath('/orders')
  revalidatePath('/customers')
  return { created: res.created, updated: res.updated, error: res.error }
}
