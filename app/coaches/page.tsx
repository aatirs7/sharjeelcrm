import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coaches } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { titleCase } from '@/lib/labels'
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
import { CoachFormDialog } from '@/components/coaches/coach-form-dialog'
import { CoachRowActions } from '@/components/coaches/coach-row-actions'

export const dynamic = 'force-dynamic'

const STATUS_CLASSES: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  paused: 'text-amber-600 dark:text-amber-400',
  banned: 'text-rose-600 dark:text-rose-400',
}

export default async function CoachesPage() {
  const rows = await db.select().from(coaches).orderBy(desc(coaches.revenueCents))

  return (
    <div className="space-y-5">
      <PageHeader
        marker="coaches"
        title="Coaches"
        meta={`${rows.length} total`}
        action={<CoachFormDialog mode="create" trigger={<Button>Add coach</Button>} />}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead>Promo</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No coaches yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  {c.name}
                  <div className="text-xs text-muted-foreground">
                    {c.coachCode ?? '—'}
                    {' · '}
                    <span className={STATUS_CLASSES[c.status] ?? ''}>{c.status}</span>
                    {c.loginCodeHash ? ' · code set' : ' · no code'}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {c.promoCode ? (
                    <span className="rounded bg-muted px-1.5 py-0.5">{c.promoCode}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{titleCase(c.tier)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(Number(c.commissionRate) * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.closedSalesCount}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(c.revenueCents)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatCents(c.commissionOwedCents)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCents(c.commissionPaidCents)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <CoachRowActions coachId={c.id} status={c.status} hasCode={!!c.loginCodeHash} />
                    <CoachFormDialog
                      mode="edit"
                      coach={{
                        id: c.id,
                        name: c.name,
                        coachCode: c.coachCode,
                        promoCode: c.promoCode,
                        discordUsername: c.discordUsername,
                        commissionRate: c.commissionRate,
                        tier: c.tier,
                        payoutMethod: c.payoutMethod,
                        trackingLink: c.trackingLink,
                        notes: c.notes,
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
