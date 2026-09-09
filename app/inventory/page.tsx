import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { inventoryItems, products } from '@/lib/db/schema'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { AddInventoryDialog, InventoryStatusSelect } from '@/components/inventory/inventory-forms'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  available: 'text-emerald-600 dark:text-emerald-400',
  reserved: 'text-amber-600 dark:text-amber-400',
  sold: 'text-muted-foreground',
  unavailable: 'text-rose-600 dark:text-rose-400',
}

export default async function InventoryPage() {
  const [rows, productList] = await Promise.all([
    db
      .select({
        id: inventoryItems.id,
        label: inventoryItems.label,
        status: inventoryItems.status,
        notes: inventoryItems.notes,
        productName: products.name,
      })
      .from(inventoryItems)
      .leftJoin(products, eq(inventoryItems.productId, products.id))
      .orderBy(desc(inventoryItems.createdAt)),
    db.select({ id: products.id, name: products.name }).from(products),
  ])

  const counts = rows.reduce<Record<string, number>>((m, r) => {
    m[r.status] = (m[r.status] ?? 0) + 1
    return m
  }, {})

  return (
    <div className="space-y-5">
      <PageHeader
        marker="inventory"
        title="Inventory"
        meta={`${counts.available ?? 0} available · ${rows.length} total`}
        action={<AddInventoryDialog products={productList} />}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Set status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No inventory tracked. Credentials stay private and are never posted to Discord.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.label}
                  {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.productName ?? '—'}</TableCell>
                <TableCell className={`text-sm ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</TableCell>
                <TableCell>
                  <InventoryStatusSelect id={r.id} status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
