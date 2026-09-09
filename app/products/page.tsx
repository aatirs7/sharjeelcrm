import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { ProductDialog, ToggleActive } from '@/components/products/product-forms'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const rows = await db.select().from(products).orderBy(desc(products.createdAt))

  return (
    <div className="space-y-5">
      <PageHeader
        marker="products"
        title="Products"
        meta={`${rows.length} products`}
        action={<ProductDialog mode="create" trigger={<Button>Add product</Button>} />}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No products yet. Add the catalog you sell.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.name}
                  {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.category ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(p.priceCents)}</TableCell>
                <TableCell>
                  <span className={p.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                    {p.active ? 'active' : 'inactive'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <ToggleActive id={p.id} active={p.active} />
                    <ProductDialog
                      mode="edit"
                      product={{ id: p.id, name: p.name, category: p.category, priceCents: p.priceCents, description: p.description }}
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
