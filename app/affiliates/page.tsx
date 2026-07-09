import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
import { affiliates } from '@/lib/db/schema'
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
import { AffiliateFormDialog } from '@/components/affiliates/affiliate-form-dialog'
import { MarkCommissionPaid } from '@/components/affiliates/mark-commission-paid'
import { PageHeader } from '@/components/page-header'

export default async function AffiliatesPage() {
  const rows = await db.select().from(affiliates).orderBy(desc(affiliates.revenueCents))

  return (
    <div className="space-y-5">
      <PageHeader
        marker="affiliates"
        title="Affiliates"
        meta={`${rows.length} total`}
        action={<AffiliateFormDialog mode="create" trigger={<Button>Add affiliate</Button>} />}
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No affiliates yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.name}
                  {a.discordUsername && (
                    <div className="text-xs text-muted-foreground">{a.discordUsername}</div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {a.referralCode ? (
                    <span className="rounded bg-muted px-1.5 py-0.5">{a.referralCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(Number(a.commissionRate) * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.closedSalesCount}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(a.revenueCents)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCents(a.commissionOwedCents)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCents(a.commissionPaidCents)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <MarkCommissionPaid affiliateId={a.id} owedCents={a.commissionOwedCents} />
                    <AffiliateFormDialog
                      mode="edit"
                      affiliate={{
                        id: a.id,
                        name: a.name,
                        discordUsername: a.discordUsername,
                        referralCode: a.referralCode,
                        commissionRate: a.commissionRate,
                        notes: a.notes,
                      }}
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
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
