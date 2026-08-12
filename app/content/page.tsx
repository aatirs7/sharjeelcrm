import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coachContent, coaches } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { ContentFormDialog } from '@/components/content/content-form-dialog'

export const dynamic = 'force-dynamic'

const nf = new Intl.NumberFormat('en-US')

export default async function ContentPage() {
  const [rows, coachRows] = await Promise.all([
    db
      .select({
        id: coachContent.id,
        coachName: coaches.name,
        videoLink: coachContent.videoLink,
        views: coachContent.views,
        comments: coachContent.comments,
        dms: coachContent.dms,
        leadsGenerated: coachContent.leadsGenerated,
        ticketsOpened: coachContent.ticketsOpened,
        buyers: coachContent.buyers,
        revenueCents: coachContent.revenueCents,
        createdAt: coachContent.createdAt,
      })
      .from(coachContent)
      .leftJoin(coaches, eq(coachContent.coachId, coaches.id))
      .orderBy(desc(coachContent.createdAt)),
    db.select({ id: coaches.id, name: coaches.name }).from(coaches),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        marker="content"
        title="Content"
        meta={`${rows.length} posts`}
        action={<ContentFormDialog coaches={coachRows} />}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Coach</TableHead>
              <TableHead>Video</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead className="text-right">Comments</TableHead>
              <TableHead className="text-right">DMs</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Buyers</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  No content logged yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.coachName ?? '—'}</TableCell>
                <TableCell className="max-w-[160px] truncate">
                  {r.videoLink ? (
                    <a href={r.videoLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      link
                    </a>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{nf.format(r.views)}</TableCell>
                <TableCell className="text-right tabular-nums">{nf.format(r.comments)}</TableCell>
                <TableCell className="text-right tabular-nums">{nf.format(r.dms)}</TableCell>
                <TableCell className="text-right tabular-nums">{nf.format(r.leadsGenerated)}</TableCell>
                <TableCell className="text-right tabular-nums">{nf.format(r.ticketsOpened)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{nf.format(r.buyers)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(r.revenueCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
