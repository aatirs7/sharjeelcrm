import { desc, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fraudFlags } from '@/lib/db/schema'
import { titleCase } from '@/lib/labels'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { FraudActions } from '@/components/fraud/fraud-actions'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  self_referral: 'Self-referral',
  duplicate_id: 'Duplicate Discord id',
  rapid_referrals: 'Rapid referrals',
  repeat_refunder: 'Repeat refunder',
  attribution_churn: 'Attribution churn',
}

function fmt(d: Date | string) {
  return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function FraudPage() {
  const open = await db
    .select()
    .from(fraudFlags)
    .where(ne(fraudFlags.status, 'dismissed'))
    .orderBy(desc(fraudFlags.createdAt))
    .limit(200)

  return (
    <div className="space-y-5">
      <PageHeader
        marker="fraud"
        title="Fraud review"
        meta={`${open.filter((f) => f.status === 'open').length} open`}
      />

      <p className="text-sm text-muted-foreground">
        Flags are warnings for review, never automatic bans. Updated daily.
      </p>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nothing flagged. All clear.
                </TableCell>
              </TableRow>
            )}
            {open.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{fmt(f.createdAt)}</TableCell>
                <TableCell className="text-sm font-medium">{TYPE_LABEL[f.type] ?? titleCase(f.type)}</TableCell>
                <TableCell className="text-sm">{f.detail}</TableCell>
                <TableCell>
                  <span className={f.status === 'open' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                    {f.status}
                  </span>
                </TableCell>
                <TableCell>{f.status === 'open' ? <FraudActions id={f.id} /> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
