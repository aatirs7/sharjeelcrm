import { redirect } from 'next/navigation'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads, orders } from '@/lib/db/schema'
import { getCurrentRep, getSession } from '@/lib/auth'
import { formatCents } from '@/lib/money'
import { MetricCard } from '@/components/dashboard/metric-card'
import { PageHeader, SectionLabel } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export default async function MyPerformancePage() {
  const session = await getSession()
  const rep = await getCurrentRep()
  // Admins have no personal worker scope; send them to the admin workers view.
  if (session?.role === 'admin') redirect('/workers')
  if (!rep) redirect('/login')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const myLeads = await db.select().from(leads).where(eq(leads.assignedRepId, rep.id))
  const completed = myLeads.filter((l) => l.status === 'completed')
  const openDeals = myLeads.filter(
    (l) => !['completed', 'cancelled', 'refunded', 'disputed'].includes(l.status)
  )
  const followUpsDue = myLeads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= now)

  // Revenue from this worker's completed deals (via their orders).
  const myOrders = await db
    .select()
    .from(orders)
    .where(and(gte(orders.paidAt, monthStart)))
  const myLeadIds = new Set(myLeads.map((l) => l.id))
  const myRevenueThisMonth = myOrders
    .filter((o) => o.leadId && myLeadIds.has(o.leadId) && o.paymentStatus === 'paid')
    .reduce((s, o) => s + o.priceCents, 0)

  const decided = completed.length + myLeads.filter((l) => l.status === 'cancelled').length
  const closeRate = decided ? Math.round((completed.length / decided) * 100) : null

  return (
    <div className="space-y-8">
      <PageHeader
        marker="my performance"
        title={rep.displayName ?? 'My performance'}
        meta="your deals and results"
      />

      <div className="space-y-3">
        <SectionLabel>this month</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Deals claimed" value={myLeads.length} />
          <MetricCard label="Open deals" value={openDeals.length} />
          <MetricCard label="Completed" value={completed.length} />
          <MetricCard label="Close rate" value={closeRate == null ? '—' : `${closeRate}%`} />
          <MetricCard label="Follow-ups due" value={followUpsDue.length} sub={followUpsDue.length ? 'needs attention' : 'all clear'} />
          <MetricCard label="Revenue (month)" value={formatCents(myRevenueThisMonth)} />
        </div>
      </div>
    </div>
  )
}
